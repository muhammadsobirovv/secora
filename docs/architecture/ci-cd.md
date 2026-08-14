# CI/CD (Module 14)

Five GitHub Actions workflows cover this monorepo's CI/CD surface. This document is the map of what each does, how they relate, what caching they use, and every secret/variable a deployment can optionally configure.

## Workflow inventory

| File | Trigger | Purpose |
|---|---|---|
| `.github/workflows/ci.yml` | push/PR to `main` | PR validation: install, lint, typecheck, unit tests (with a real Postgres+pgvector service), DB migration validation, build, CLI smoke test, Python SDK tests, Go SDK build/vet/test. |
| `.github/workflows/mobile-ci.yml` | push/PR touching `apps/mobile/**` | Flutter analyze, unit tests, Android APK/AAB build, iOS build (no codesign). |
| `.github/workflows/desktop-ci.yml` | push/PR touching `apps/desktop/**` | Frontend (Turborepo) lint/typecheck/build, Rust fmt/clippy/test, per-OS Tauri bundle build (unsigned). |
| `.github/workflows/security-scan.yml` | push/PR to `main`, weekly schedule | CodeQL static analysis, `pnpm audit`, `cargo audit`. |
| `.github/workflows/docker-publish.yml` | push to `main`, `v*.*.*` tags | Builds and pushes the `api`/`worker`/`web` container images to GHCR, with SBOM + provenance attestations, Trivy vulnerability scanning, and cosign keyless signing. |
| `.github/workflows/release.yml` | `v*.*.*` tags, manual dispatch | Release orchestration: re-runs the full verification gate against the tagged commit, generates a monorepo-wide SBOM, creates the GitHub Release, and (optionally) publishes the CLI to npm / Python SDK to PyPI. |
| `.github/dependabot.yml` | scheduled (weekly), not a workflow file — configures GitHub's own bot | Opens PRs for outdated/vulnerable dependencies across every ecosystem this monorepo uses (npm/pnpm, cargo, pub, docker, github-actions) — see `docs/security/supply-chain.md`. |

**PR validation vs. release/deployment, deliberately separate**: `ci.yml`/`mobile-ci.yml`/`desktop-ci.yml`/`security-scan.yml` answer "is this change safe to merge" and run on every push/PR. `docker-publish.yml`/`release.yml` answer "is this tagged commit ready to ship" and only run on `main`/tags — a docs-only PR never triggers a multi-gigabyte image build or a release orchestration run.

## Coverage per component

- **Backend (`apps/api`)**: lint, typecheck, unit tests (real Postgres+pgvector), `prisma generate`, `prisma validate` + migration drift check, build, Docker image build+scan+sign.
- **Worker**: shares `apps/api`'s test/build coverage (same package); separate Docker image (`Dockerfile.worker`) built+scanned+signed independently.
- **Web (`apps/web`)**: lint, typecheck, build (Turborepo), Docker image build+scan+sign.
- **Mobile (`apps/mobile`)**: `flutter analyze`, `flutter test --coverage`, Android release build (APK+AAB, debug-signed unless keystore secrets configured), iOS release build (unsigned).
- **Desktop (`apps/desktop`)**: frontend covered by the same Turborepo `lint`/`check-types`/`build` tasks as every other `apps/*` package; Rust crate gets its own `cargo fmt`/`clippy`/`test`/`audit`; per-OS Tauri bundle build (unsigned unless updater signing key + code-signing certs configured).
- **CLI (`packages/cli`)**: covered by the Turborepo `lint`/`check-types`/`build` tasks (no `test` script exists yet — Turborepo skips packages without one, this is not a CI gap, see "Known gaps" below); `ci.yml`'s dedicated CLI smoke test (`node packages/cli/dist/bin/pentesthub.js --help`) proves the built bin entry point actually runs; `release.yml` can optionally publish it to npm.
- **SDKs**: Python (`sdks/python`, pytest) and Go (`sdks/go`, `go build`/`go vet`/`go test`) each get a dedicated `ci.yml` job (their own toolchains, not part of the pnpm/Turborepo graph). `release.yml` can optionally publish the Python SDK to PyPI; the Go SDK needs no publish step (Go modules resolve directly from git tags).

## Caching

- **pnpm store**: `actions/setup-node@v4`'s `cache: pnpm` input, keyed on `pnpm-lock.yaml`, in every Node-based job across all workflows.
- **Turborepo task cache**: `actions/cache@v4` on the `.turbo` directory, one cache scope per job (`turbo-lint-`, `turbo-check-types-`, `turbo-test-`, `turbo-build-`, `turbo-release-`), keyed on the commit SHA with a prefix `restore-keys` fallback — lets Turborepo skip re-running a task for a package it can prove is unaffected by the current change, without needing a paid remote-cache service (`TURBO_TOKEN`/`TURBO_TEAM`, not configured — see "Community Edition guarantee" below).
- **Cargo**: `Swatinem/rust-cache@v2`, scoped to `apps/desktop/src-tauri`, in `desktop-ci.yml` and the `cargo-audit` job.
- **Docker layers**: GitHub Actions' own cache backend (`cache-from`/`cache-to: type=gha`) in `docker-publish.yml`, scoped per component — no self-hosted registry cache required.
- **`release.yml`'s verify job runs with `turbo run ... --force`** deliberately, bypassing all of the above caching — a release should never ship on the strength of a possibly-stale cached result, even though every other workflow leans on caching for speed.

## Security/dependency scanning, SBOM, and signing

- **CodeQL** (`security-scan.yml`): static analysis over the TypeScript/JavaScript surface, `security-extended` query pack, weekly schedule plus push/PR.
- **`pnpm audit`** (`security-scan.yml`): npm/pnpm dependency graph, `--audit-level high`, informational (`continue-on-error: true`) until a triage process exists.
- **`cargo audit`** (`security-scan.yml`, Module 14 addition): RustSec Advisory Database for `apps/desktop/src-tauri`'s dependency graph — same informational posture.
- **Trivy** (`docker-publish.yml`, Module 14 addition): scans each just-built container image, uploads SARIF to GitHub code scanning, informational (`exit-code: "0"`) for the same reason.
- **SBOM**: two layers — per-image (BuildKit-native `sbom: true`/`provenance: true` attestations on every pushed image, retrievable via `docker buildx imagetools inspect` or `cosign download sbom`) and monorepo-wide (`release.yml`'s CycloneDX SBOM over the full npm/pnpm workspace, attached as a GitHub Release asset).
- **Container signing**: cosign keyless signing (`docker-publish.yml`) — no private key to generate/store/rotate; the signing identity is GitHub's own OIDC token, verified against the public-good Fulcio CA and logged to the public Rekor transparency log. Verify a signed image with:
  ```
  cosign verify \
    --certificate-identity-regexp "https://github.com/<owner>/pentesthub-ai/.github/workflows/docker-publish.yml@.*" \
    --certificate-oidc-issuer https://token.actions.githubusercontent.com \
    ghcr.io/<owner>/pentesthub-ai-api:<tag>
  ```

## Community Edition guarantee — no mandatory paid infrastructure

Every tool used across all five workflows is free and requires no account beyond the ones a deployment already needs (a GitHub account to host the repo; optionally a container registry, which GHCR provides for free tied to the same GitHub account):

- Turborepo's **local** cache (via `actions/cache`) is used, not Turborepo's remote-cache service — no `TURBO_TOKEN`/`TURBO_TEAM` secret is read anywhere.
- CodeQL, Trivy, `cargo-audit`, `pnpm audit`, cosign, and CycloneDX are all free, open-source, no-account-required tools.
- Every *optional* publish step (`release.yml`'s `publish-cli`/`publish-python-sdk` jobs) is gated behind a repository **variable** (`vars.PUBLISH_CLI_TO_NPM`/`vars.PUBLISH_PYTHON_SDK_TO_PYPI`, both default unset/false) and, when enabled, a **secret** — a fork or self-hosted deployment with none of these configured still gets a fully working CI/CD pipeline (build, lint, typecheck, test, migration validation, Docker images, SBOM, signing, GitHub Release); nothing about running or deploying this platform depends on any of them.

## Required secrets and variables

All of the following are **optional** — every workflow degrades gracefully (skips the gated step) when unset, per the Community Edition guarantee above.

| Name | Kind | Used by | Purpose |
|---|---|---|---|
| `GITHUB_TOKEN` | secret (auto-provided) | `docker-publish.yml`, `github-release` job | GHCR login, GitHub Release creation. No manual setup — GitHub injects this automatically per-run. |
| `ANDROID_KEYSTORE_BASE64` / `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD` | secrets | `mobile-ci.yml` | Release-signs the Android APK/AAB. Unset → debug-signed build (CI still green). |
| `APPLE_ID` / `MATCH_*` (Fastlane match) | secrets | not yet wired into `mobile-ci.yml`'s iOS job (documented gap — see below) | Would enable a signed IPA for TestFlight/App Store. Currently the iOS job only builds `--no-codesign`. |
| `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | secrets | not yet wired into `desktop-ci.yml` (documented gap) | Would enable signed installers + a working auto-updater (see `docs/architecture/auto-update.md`'s desktop section — the `tauri.conf.json` updater `pubkey` is still a placeholder). Currently `desktop-ci.yml` only builds unsigned bundles. |
| `vars.PUBLISH_CLI_TO_NPM` | repository variable | `release.yml` | Set to `"true"` to enable the optional `publish-cli` job. |
| `NPM_TOKEN` | secret | `release.yml`'s `publish-cli` job | npm publish token for `@pentesthub/cli`. Only read if `PUBLISH_CLI_TO_NPM` is `"true"`. |
| `vars.PUBLISH_PYTHON_SDK_TO_PYPI` | repository variable | `release.yml` | Set to `"true"` to enable the optional `publish-python-sdk` job. |
| `PYPI_API_TOKEN` | secret | `release.yml`'s `publish-python-sdk` job | PyPI upload token. Only read if `PUBLISH_PYTHON_SDK_TO_PYPI` is `"true"`. |
| `vars.NEXT_PUBLIC_API_URL` | repository variable | `docker-publish.yml` | Baked into the `web` image's build (falls back to a placeholder `https://api.your-company.com` if unset — a real deployment should set this). |

Nothing else — no database URL, JWT secret, or encryption key secret is read from repository secrets; `ci.yml`/`release.yml` use fixed, clearly-labeled test-only values for those (see the `env:` block at the top of each file), scoped to the ephemeral CI runner and never used against a real deployment's data.

## Known gaps (disclosed, not fixed by this pass)

- **`packages/cli` has no `test` script** — Turborepo silently skips it for the `test` task rather than failing, which is correct behavior but means the CLI's only verification is the smoke test (`--help` runs without crashing) plus typecheck/lint. Adding real unit tests for `packages/cli/src/commands/*.ts` is future work, not part of this CI/CD pass.
- **iOS release signing** (Fastlane match) and **Tauri updater/installer signing** are both real, disclosed, pre-existing gaps this pass surfaces in the secrets table above rather than closes — both need a real Apple Developer account / generated signing keypair respectively, neither of which this pass can create.
- **`mobile-ci.yml` and `desktop-ci.yml` are unverified in the sandbox this repo has been developed in** — no Flutter SDK, no Rust toolchain, no Windows/macOS runners were available. Both are written against each ecosystem's documented, standard GitHub Actions conventions and should be treated as "should work" rather than "confirmed working" until they run green once on a real push. See each workflow file's own header comment for the same disclosure.

## Related docs

- `deploy/README.md` — deployment paths (Docker Compose, Kubernetes, bare-metal installer) these pipelines' artifacts feed into.
- `docs/architecture/auto-update.md` — how the artifacts these pipelines produce relate to each component's update/rollback/version-pinning story.
- `docs/security/` — secrets management, TLS/mTLS, WAF compatibility (the *runtime* security posture; this document covers *build-time* security only).
- `docs/security/supply-chain.md` (Module 15, task #345) — the full dependency/SBOM/signing/plugin-integrity policy this document's "Security/dependency scanning, SBOM, and signing" section is a summary of.
