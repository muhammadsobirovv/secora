# Module 20 — Phases 18-21: Documentation, Security Policy, License, Supply-Chain Finalization

## Phase 18: Documentation finalization

Checked `README.md`, `PROJECT_SPEC.md`, `SECURITY.md`, and
`docs/security/supply-chain.md` for drift against this module's concrete
changes (billing quota enforcement for RECON_JOBS/SCANNER_JOBS, Stripe
webhook ordering, deployment env-var fixes, SDK/CLI API-keys parity).

- `README.md`'s monorepo-layout and local-first-migration framing is
  high-level enough that none of this module's changes require an edit.
- `PROJECT_SPEC.md` follows a per-module "## Module N — ..." appended
  summary convention, with each entry written once that module's full
  scope is closed out (compare the Module 19 entry, written after all of
  Module 19's phases completed). Module 20's own entry belongs in that
  same slot, but is deliberately deferred to this module's closure phase
  (Phase 40-45, final report) rather than written mid-flight here, so it
  can describe the module's complete final state in one pass instead of
  being edited repeatedly as later phases land. Not a gap — a sequencing
  decision consistent with the doc's own established pattern.
- `SECURITY.md`'s "Supported versions" section correctly states the
  project is pre-1.0 at `0.15.0` today. Phase 22-24 (task #563) is
  expected to cut a `1.0.0` release per `docs/architecture/release-engineering.md`'s
  own policy; when that version bump lands, this section's "pre-1.0 /
  only latest `main` is supported" language will need a matching update
  (e.g. a real supported-version window). Flagged here as a dependency
  for Phase 22-24, not fixed now, to avoid stating a supported-version
  policy for a version number that doesn't exist yet.
- `docs/security/supply-chain.md` (full document, including the "Open
  items (honest disclosure)" section at line 111) re-read in full. Its
  three open items — audit/scan tools staying informational rather than
  CI-blocking, no author-key registry beyond the marketplace operator's
  own key, and no claimed SLSA provenance level — are all still accurate
  and unaffected by this module. Its "zero new third-party SDKs" framing
  (originally about Module 15) also holds for Module 20's own SDK/CLI
  parity work: the new `api-keys` resource files in
  `packages/sdk-typescript`, `sdks/python`, `sdks/go`, and `packages/cli`
  each use their own package's pre-existing `HttpClient`/`http_client.go`
  — zero new npm/pip/go dependencies were added anywhere in this module.
  No doc edit needed; this is a confirmation, not a drift.

## Phase 19: Security policy re-verification

Re-read `SECURITY.md` in full (reporting channels, scope, supported
versions, disclosure timeline commitments, recognition). All sections
remain accurate:

- Reporting channels (GitHub Security Advisories preferred, email
  fallback with an explicit "this is a placeholder, monitor it or
  replace it" caveat) are unchanged and still correctly described.
- Scope/out-of-scope boundaries correctly list `apps/*`, `packages/*`
  (CLI, Python SDK, Go SDK), `extensions/*`, and CI/deployment configs —
  this module's changes (recon/vuln command handlers, billing module
  files, SDK/CLI resource files, `docker-compose.yml`,
  `deploy/k8s/*.yaml`, `deploy/installer/install.sh`) all fall within
  the already-declared scope; no scope-boundary edit is needed.
- The "disclosed limitation" out-of-scope carve-out (§Scope, "Findings
  that only apply to a deliberately-disclosed limitation already written
  down in this codebase's own docs") correctly continues to cover the
  documented-not-fixed QUOTA_EXCEEDED 403-vs-429 inconsistency
  (`docs/reviews/0029-...md`) and the quota check-then-act race
  (`docs/reviews/0023-module-19-monetization-security-review.md`) — a
  report about either would be triaged as already-known rather than
  novel, which is the correct, intended behavior of that clause.
- Acknowledgment/response-time commitments (5 business days) and the
  supported-versions caveat discussed in Phase 18 above are the only
  section that will need a follow-up edit, and only once Phase 22-24
  actually changes the version number it describes.

No SECURITY.md edits made this phase — it remains accurate for the
codebase as it stands today.

## Phase 20: License

No root `LICENSE` file existed. Every package's `package.json`
consistently declares `"license": "UNLICENSED"` (proprietary, all
rights reserved) except `packages/typescript-config`, which declares
`"license": "MIT"` — trivial, non-proprietary `tsconfig.json`
boilerplate with no product logic, a reasonable, low-risk, intentional
exception rather than an inconsistency.

**Decision**: adding a root `LICENSE` file that *formalizes* the
already-consistent `UNLICENSED`/proprietary default is a safe,
non-discretionary completeness fix — it changes nothing about the
project's actual licensing posture, it just makes that posture
discoverable without inspecting every `package.json` individually
(which is exactly what a repository root `LICENSE` file is for).
Choosing to *change* that posture — e.g. adopting MIT/Apache-2.0/AGPL
for part or all of the project, a decision with real commercial and
legal consequences — is explicitly **out of scope** for this pass and
was not made. The new `LICENSE` file says so directly, so a future
reader (human or agent) doesn't mistake "we wrote down the existing
default" for "we made the open-source decision."

**Fixed**: added `LICENSE` (repository root) — a short proprietary/
all-rights-reserved notice, an explicit callout of the
`packages/typescript-config` MIT exception (with rationale, not framed
as a defect), and a note on third-party dependency licensing pointing
at `docs/security/supply-chain.md`. No `package.json` files were
changed; their existing `"license"` fields already agreed with this.

## Phase 21: Supply-chain finalization

Re-verified in Phase 18 above (folded in since re-reading
`docs/security/supply-chain.md` in full necessarily covers both
"is documentation accurate" and "is the supply-chain story itself still
correct"). No new dependency was added by any of Module 20's changes
(quota enforcement reuses existing `QuotaService`/`UsageService`;
deployment fixes are config-only; SDK/CLI parity reuses each package's
own existing HTTP client). `pnpm-lock.yaml`/`Cargo.lock`/language-
specific lockfiles were not touched this module — nothing new for
Dependabot, `pnpm audit`, or `cargo audit` to pick up as a result of
this module's own work.

## Verification

- `LICENSE`: plain-text file, no build/compile step applicable;
  reviewed by re-reading its own content for internal consistency
  (does it contradict any `package.json`'s declared license? — no) and
  cross-checked `packages/typescript-config/package.json`'s `"license"`
  field one more time to confirm the callout is accurate.
- `SECURITY.md` / `docs/security/supply-chain.md`: read in full (not
  excerpted) this phase; no edits were made to either, consistent with
  the finding that both remain accurate — a change was deliberately
  *not* made where the audit found no real drift, rather than editing
  for the sake of showing activity.
- Cross-referenced `docs/architecture/release-engineering.md`'s
  versioning policy to confirm the Phase 22-24 version-bump expectation
  cited in Phase 18/19 above is this project's own stated plan, not an
  assumption introduced by this document.

## Related docs

- `docs/reviews/0027-module-20-billing-finalization-community-edition.md`,
  `0028-module-20-deployment-health-backup-sse.md`,
  `0029-module-20-api-stability-sdk-cli-mobile-desktop.md` — this
  module's earlier phase write-ups.
- `SECURITY.md`, `docs/security/supply-chain.md` (repo root / `docs/security/`)
  — the two documents re-verified, not edited, in this phase.
- `LICENSE` (repo root) — new, added this phase.
