# Auto Update, Rollback & Version Pinning (Module 14)

This platform ships six different runtime surfaces — the web app, the API/worker deployment, the desktop agent, the mobile app, the CLI, and installed plugins — each with a different, correct answer to "how does this get updated." There is no single auto-update mechanism; this document is the map of what exists for each, and what "rollback" and "version pinning" mean in each context.

## Server (API + worker + web) — deploy-time, not runtime

The API, worker, and web app are not independently versioned artifacts a user "updates" — they're redeployed together from the same monorepo, same as any server-side application. There is no in-process auto-update for these; "update" means the operator runs the normal deployment path (`deploy/installer/upgrade.sh`, a new container image tag, a new Helm/K8s manifest apply).

**Version visibility**: every server process reports its own running version from `process.env.npm_package_version` (the API's own `package.json` version, injected by npm/pnpm when a process is launched via a `package.json` script):
- `ClusterOverviewService.getOverview()` → `version.current` (Admin Console).
- `HealthController.liveness()` → `version` field on the public `/observability/health` probe.
- `worker.main.ts` logs it once at boot.
- `WorkerNode.version` (nullable, populated on register/heartbeat) — version-skew visibility across a horizontally-scaled worker fleet during a rolling upgrade; `null` for any client that doesn't report one (older clients, or any client that omits it — not the same as "no version").

**Web staleness detection**: `apps/web` doesn't "update" client-side — a redeploy just serves new JS on the next page load. The gap that closes is a browser tab left open across a redeploy, silently running old JS. `useAppVersionCheck` (`apps/web/features/system/hooks/use-app-version-check.ts`) polls `/observability/health` every 5 minutes and compares its `version` against `NEXT_PUBLIC_APP_VERSION` (baked into the bundle at build time via `next.config.js`). On a mismatch, `UpdateAvailableBanner` shows a dismissible, user-triggered "Refresh" prompt — it never auto-reloads (see that hook's doc comment for why).

**Rollback**: `deploy/installer/rollback.sh` — reverts to the git ref `upgrade.sh` recorded before its last run, and optionally restores the pre-upgrade database backup (`--restore-backup`). See `docs/security/` and the disaster-recovery section of `deploy/installer/README.md` for the full PITR/failback story this pairs with. This is the one true "rollback" in this platform — a deploy-level revert, not a per-component concept. Reuse this vocabulary rather than inventing a parallel one.

**Version pinning**: pin the git ref/tag `upgrade.sh` deploys from (Compose/installer path), or pin the container image tag rather than tracking `:latest` (Docker/K8s path — see `deploy/k8s/`, `deploy/docker-compose*.yml`). There's no separate "pinning flag" in the application itself; the deployment tooling's own ref/tag is the pin.

## Desktop (`apps/desktop`, Tauri)

Already built in Module 7 (task #145): `tauri-plugin-updater`, configured in `apps/desktop/src-tauri/tauri.conf.json` against a hosted manifest endpoint (`https://releases.pentesthub.ai/{{target}}/{{arch}}/{{current_version}}`), surfaced in `apps/desktop/src/features/settings/UpdatesSettingsPanel.tsx` (`check()` / `downloadAndInstall()` / `relaunch()`). Signature verification is ed25519 (`tauri signer generate`) — the `pubkey` in `tauri.conf.json` is currently a placeholder that must be replaced with a real generated key before this deployment path is used for a real release (an already-disclosed gap from Module 7, not newly introduced here).

**Rollback**: not supported by `tauri-plugin-updater` — it has no downgrade path. A user who needs to roll back must uninstall and reinstall an older release from the release archive by hand. This is a real, disclosed gap; if it becomes a priority, the fix is to publish and retain every release's installer (not just latest) at the manifest endpoint and add a "reinstall a specific version" flow to `UpdatesSettingsPanel.tsx` — out of scope for this pass.

**Version pinning**: a fleet-managed deployment that wants to hold desktop clients on a known-good version controls this at the release-manifest level (don't publish a new manifest entry until ready to roll it out), not via an in-app setting — there's no `AUTO_UPDATE_ENABLED`-style flag in the desktop app today.

## Mobile (`apps/mobile`, Flutter)

App stores (Apple App Store, Google Play) are the only party allowed to replace this app's binary — there is no in-app self-update, by store policy. `AppUpdateService` (`apps/mobile/lib/core/updates/app_update_service.dart`) only does the "check" half: compares `PackageInfo.fromPlatform()`'s version against `/observability/health`'s `version` field, and if they differ, `app.dart` shows a dismissible dialog with an "Update" button that opens the store listing (`url_launcher`, new dependency this pass — see `pubspec.yaml`). Store listing URLs (`_kAppStoreUrl`/`_kPlayStoreUrl` in `app.dart`) are placeholders pending real store listings once this app is published.

**Rollback**: not applicable — the same store-policy constraint that blocks self-update blocks self-downgrade. A user rolls back by installing an older build through the store's own version-history tooling (where the store offers one) or via a fresh install of an archived build (internal testing tracks only).

**Version pinning**: not applicable to end users on public app stores (Apple/Google always serve their own "latest approved" build). An enterprise MDM-distributed build (out of scope for this pass) would pin via the MDM's own app-version-control policy, not anything this codebase implements.

## CLI (`packages/cli`, `@pentesthub/cli` on npm)

`pentesthub version` (or `--version`/`-v`) prints the installed version, reading the package's own `package.json` (not `npm_package_version`, since that env var is only set when a process is launched *by* npm, not when a globally-installed binary is invoked directly — see `packages/cli/src/commands/version.ts`'s doc comment). `pentesthub update` checks npm's registry (`PENTESTHUB_NPM_REGISTRY` env var for a private mirror, default `https://registry.npmjs.org`) for a newer published version and, if one exists, prints the command to run (`npm install -g @pentesthub/cli@latest`) — it never replaces its own binary in place. Same "check, don't silently self-replace" posture as mobile, for the same reason: a CLI silently rewriting itself is exactly the kind of "runs code without being asked" behavior this platform's security posture argues against elsewhere.

**Rollback / version pinning**: `npm install -g @pentesthub/cli@<version>` — npm's own version pinning is the mechanism; nothing bespoke is needed since the CLI is a normal npm package.

## Plugins (Module 13 Plugin SDK/Marketplace)

`GetAvailablePluginUpdatesQuery` (`apps/api/src/modules/plugins/queries/plugin-installations.query.ts`, exposed at `GET enterprise/organizations/:organizationId/plugin-installations/updates`) lists installed plugins whose installed `PluginVersion` is not the plugin's latest **non-deprecated** published version — the "check for updates" surface the Plugin SDK/Marketplace never had (it already had a manual upgrade path, `UpdatePluginInstallationCommand`, just no way to know when to use it).

**Rollback**: already exists — `UpdatePluginInstallationCommand` accepts any `versionId` belonging to the plugin, including an older one, so "rolling back" a plugin installation is the same call as upgrading it, just pointed at an earlier `PluginVersion` row. No new mechanism needed.

**Version pinning**: implicit — an installation stays on its `versionId` until an admin explicitly calls the update command. There's no auto-apply of new plugin versions anywhere in this codebase, so every installation is "pinned" by default; this query only makes the drift visible, it never changes anything on its own.

## Related docs

- `docs/architecture/api-gateway.md` — this API's versioning policy (why there's no `/v1/` URI versioning), relevant context for why "server is one version ahead" isn't itself evidence of a breaking client incompatibility.
- `deploy/installer/README.md` — the disaster-recovery section covering `upgrade.sh`/`rollback.sh`/PITR/failback in full.
