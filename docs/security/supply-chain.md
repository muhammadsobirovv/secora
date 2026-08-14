# Supply-Chain Security

Module 15 (task #345). This is the operator-facing policy document for
"how does this platform protect itself, and you, from a compromised
dependency, a compromised build, or a compromised marketplace plugin." It
consolidates what Module 14's CI/CD already built with what this task
added, and discloses what's still open.

## Three supply chains, three different postures

This platform has three distinct things an attacker could try to poison,
and each gets a different level of protection today:

1. **npm/cargo/pub dependencies** (this monorepo's own build) — scanned,
   not gated; now also kept current via Dependabot.
2. **Container images** (what a deployment actually runs) — scanned, SBOM'd,
   and cryptographically signed.
3. **Marketplace plugins** (third-party code a workspace opts into
   installing) — signed/checksummed at publish, now also re-verified at
   install.

## 1. Dependency scanning and updates

- **Scanning** (`security-scan.yml`, Module 14): CodeQL static analysis,
  `pnpm audit --audit-level high`, and `cargo audit` for the Tauri desktop
  agent. All three are informational (`continue-on-error: true`) — a
  finding shows up in GitHub's code-scanning UI but doesn't block a PR.
  This is a deliberate choice already documented in
  `docs/architecture/ci-cd.md`: without an established triage process, a
  hard-fail gate on every transitive-dependency advisory would block
  unrelated PRs on noise. It's a real tradeoff, not a fixed one — see
  "Open items" below.
- **Automated updates** (`.github/dependabot.yml`, added this task):
  weekly PRs across every ecosystem in this monorepo — npm/pnpm (root
  workspace), cargo (`apps/desktop/src-tauri`), pub (`apps/mobile`), docker
  (`apps/api`, `apps/web` base images), and github-actions (the CI
  workflows themselves — a compromised pinned Action is as much a
  supply-chain risk as a compromised npm package). Minor/patch bumps are
  grouped into one PR per ecosystem per week; major bumps get their own
  PR since they're more likely to need a code change alongside them.
  **This file only configures scheduled version updates** — a deployment
  forking or self-hosting this repo needs to separately enable
  "Dependabot alerts" and "Dependabot security updates" in their own
  repository's Settings > Code security to get vulnerability-driven PRs,
  same as any GitHub repo (this isn't something a config file in the repo
  itself can turn on for you).
- **Zero new third-party SDKs added by Module 15**: the billing (Stripe)
  and integrations (Slack/Discord/Telegram/GitHub/GitLab/Jira/Linear/MS
  Teams) code all call each provider's REST API directly via `fetch`
  rather than pulling in an official SDK — see
  `apps/api/src/modules/billing/providers/stripe-payment-provider.ts`'s
  doc comment for the explicit reasoning (avoids forcing every Community
  Edition deployment to install a payment SDK it may never use). This
  means Module 15 added essentially zero new supply-chain surface despite
  adding eight external integrations.

## 2. Container images

Already fully covered in `docs/architecture/ci-cd.md`'s "Security/dependency
scanning, SBOM, and signing" section — Trivy scanning, dual-layer SBOM
(per-image BuildKit attestations + monorepo-wide CycloneDX), and cosign
keyless signing via GitHub OIDC. Not duplicated here; that document is the
source of truth for the container/build pipeline. This document exists
because dependency and plugin supply-chain policy don't fit naturally
inside a CI/CD-workflow reference doc.

## 3. Marketplace plugin integrity

This is the surface most directly under this platform's own control (a
plugin author isn't a well-known upstream project with its own security
team — it could be anyone).

- **At publish time** (task #333): `PublishPluginHandler`/
  `PublishPluginVersionHandler`
  (`apps/api/src/modules/plugins/commands/plugins.commands.ts`) compute a
  SHA-256 checksum over the submitted bundle
  (`PluginVersion.checksumSha256`) and, if a signature was submitted,
  verify it against an Ed25519 public key — either the publisher's own
  registered key (`MarketplacePublisher.publicKeyPem`) or the shared
  operator-configured `PLUGIN_MARKETPLACE_PUBLIC_KEY`. A version only gets
  the "verified" badge (`Plugin.verified`) when a signature was both
  present and valid — **publishing an unsigned or invalidly-signed version
  is still allowed**, a deliberate v1 scope decision (this is a
  marketplace anyone can publish to, not a curated app store; disclosed in
  `plugin-signature.util.ts`'s own doc comment and restated in
  `docs/reviews/0008-m15-security-hardening-review.md` finding #5).
- **At install time** (task #345, this pass — the actual gap this task
  closes): before this pass, the checksum computed at publish was never
  looked at again automatically — a client could call a manual
  `GET /marketplace/plugin-versions/:id/checksum` lookup endpoint, but
  nothing forced it, and `InstallPluginHandler.execute()`
  (`apps/api/src/modules/plugins/commands/plugin-installations.commands.ts`)
  installed on deprecated-check + permission-consent + dependency
  resolution alone. Now, immediately after the deprecated check,
  `InstallPluginHandler` recomputes the checksum from the currently stored
  `sourceCode` and refuses to install if it no longer matches
  `checksumSha256`. This is deliberately a **tamper-evidence** check, not
  a signature/verified-badge requirement — it fires identically whether or
  not the version was ever signed, so it doesn't change the existing
  "unsigned plugins are installable" product decision. What it does close:
  a version whose stored source was altered after publishing (database
  compromise, a bad migration, a hypothetical future admin-edit code path)
  can no longer be silently installed and executed — it's caught and
  rejected with `PLUGIN_INTEGRITY_CHECK_FAILED`.
- **Sandboxed execution**: regardless of signature/checksum status, every
  plugin hook invocation runs through `PluginSandboxService` with the
  installation's own granted∩declared permission intersection (task #334)
  — signature verification and sandboxing are independent, layered
  controls, not a single gate.

## Open items (honest disclosure)

- **`pnpm audit`/`cargo audit`/Trivy stay informational, not blocking.**
  Flipping any of them to a hard CI gate is a policy decision an operator
  should make deliberately (it will eventually block a PR on a transitive
  dependency's advisory that has nothing to do with the change), not
  something this task changes unilaterally. Dependabot (added this task)
  is the more actionable lever for actually reducing the vulnerable-window
  duration in practice.
- **No author-key registry beyond `MarketplacePublisher.publicKeyPem`** —
  `plugin-signature.util.ts` already discloses this as a narrower-than-ideal
  v1 scope (today's "verified" badge means "signed by, or co-signed by,
  the marketplace operator's key," not "signed by an arbitrary registered
  author's own key" for every publisher). `MarketplacePublisher` exists and
  is checked first when present; broadening this is a marketplace-trust
  feature, not a supply-chain integrity bug, and is out of this task's
  scope.
- **No SLSA provenance level is claimed.** The container pipeline has
  BuildKit provenance attestations (`provenance: true`) and cosign signing,
  which is a meaningful chunk of SLSA Build L2-ish practice, but this
  project does not claim or attempt to certify against a specific SLSA
  level — that would require a dedicated compliance effort this task
  doesn't attempt.

## Related docs

- `docs/architecture/ci-cd.md` — the build-time pipeline (scanning, SBOM,
  container signing) this document's §2 summarizes.
- `docs/reviews/0008-m15-security-hardening-review.md` — the broader
  Module 15 security review this task's findings are also recorded in.
- `docs/security/secrets-management.md` — how `PLUGIN_MARKETPLACE_PUBLIC_KEY`
  and other secrets in this document are meant to be generated/stored.
- `../../SECURITY.md` (repo root) — how to privately report a vulnerability
  you find in any of the surfaces this document covers.
