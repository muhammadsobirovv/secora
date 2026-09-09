# Module 20 — Phase 5: Final Security Audit

This is a final, targeted security pass before v1.0 — not a repeat of
Module 15's dedicated security hardening review (#344/#359), Module 17's
dedicated SOC/threat-intel security review (#492), Module 18's full
platform-wide security sweep (Phases 9-28, covering auth, rate limiting,
file/storage, SSRF centralization, AI safety, audit log integrity,
security headers, dependency audit), or Module 19's monetization security
review (`0023-module-19-monetization-security-review.md`). Those reviews
remain valid; this pass audits whether anything has regressed since, and
does one focused new sweep (authorization/IDOR) prompted by the real
defect found in Phase 1.

## Authorization / IDOR — new targeted sweep

Prompted by finding a real IDOR in `ListApiKeysHandler` during Phase 1
(a `workspaceId` filter used without a membership check — see
`0024-module-20-backlog-reconciliation.md`), ran a codebase-wide sweep
for the same bug class: any query/command handler that accepts a
`workspaceId`/`organizationId` directly from the client (not resolved
implicitly from the caller's own identity) and uses it in a Prisma call
without a membership check anywhere in its call chain.

**Method:** grepped all 226 non-spec files under
`apps/api/src/modules/*/{queries,commands}/*.ts` for `workspaceId`/
`organizationId` (138 raw matches), excluded every file that already
calls `resolveWorkspaceMembership`/`resolveOrganizationMembership`/
`requireEnterpriseRole`/`requireRole` (51 files — Module 9's
workspace-explicit surface, built with the check from the start), then
excluded every file using this codebase's implicit-resolution helpers
(`resolveWorkspaceForCaller`, `findPersonalWorkspaceForUser`,
`resolveTargetForCaller`, `resolveBugBountyProgramForCaller`,
`resolveBugReportForCaller`, `resolveBugBountyFindingForCaller`,
`resolveVulnScanJobForCaller`, `AiContextService.resolveWorkspaceAndProject`,
local `resolveWorkspaceId`/`workspaceResolver.resolve` — all of which
derive the workspace from the caller's own identity, then separately
verify any client-supplied child ID, like a `projectId` or `targetId`,
actually belongs to that resolved workspace before use). This left 23
files, each read in full.

**Result: no further instances found.** The `ListApiKeysHandler` fix from
Phase 1 was the only real instance of this bug class in the codebase; the
remaining 23 files were confirmed as false positives (implicit
caller-derived workspace resolution, a hardcoded literal, or an
intentionally-unauthenticated share-link flow that cross-checks the
resource's own workspace before serving anything). Full per-file
reasoning is preserved in the audit transcript; not duplicated here to
avoid a second copy of the same detail.

## Authentication, SSRF, file security, AI security, billing security, secrets

Not re-audited from zero this module — each was already the subject of a
dedicated pass:

- **Authentication** (session security, JWT, refresh rotation, MFA,
  OAuth state/CSRF, password reset, rate limiting): Module 1's original
  implementation plus fixes carried in the very first session of this
  project's history (refresh-token rotation race, OAuth state parameter,
  MFA-disable requiring current password), confirmed unchanged and not
  regressed by any Module 15-20 work (no auth-module files touched since).
- **SSRF**: centralized in Module 18 Phase 12 (`docs/operations/` —
  network security centralization). No new user-configurable-endpoint
  surface was added in Modules 19-20 (Billing/API Keys/Org Switcher touch
  no outbound-request code).
- **File security** (uploads/downloads/attachments/evidence/exports):
  Module 18 Phase 11. No new file-handling code was added in Modules
  19-20.
- **AI security** (prompt injection, untrusted evidence, tool calling,
  approval gates): Module 18 Phase 13 (regression tests), Module 17 #493
  (threat-intel-specific boundaries). No new AI code path was added in
  Modules 19-20.
- **Billing security**: Module 19's dedicated review
  (`0023-module-19-monetization-security-review.md`) covers IDOR, price/
  plan trust boundary, webhook signature/idempotency, quota concurrency,
  AI-credit double-deduction, admin-endpoint separation, read-only usage,
  and frontend secret exposure in full. Re-confirmed still accurate — no
  billing code changed since except this module's Organization-switcher
  addition, which is frontend-only and introduces no new backend trust
  boundary (see Phase 4 write-up).
- **Secrets**: repeated the `API_KEY|SECRET|TOKEN|PASSWORD|PRIVATE_KEY`
  class of grep across the repository, scoped to source (not
  `node_modules`/`dist`/`.git`). No committed secrets found. The only
  matches are: environment-variable *names* in `.env.example`/
  `.env.enterprise.example` (placeholders, no values), CI workflow env
  vars using obvious placeholder test values (e.g.
  `JWT_ACCESS_SECRET: "ci-test-jwt-access-secret-please-change-32chars"`
  in `.github/workflows/release.yml`, already noted in the Phase 0
  baseline audit), and source code that *references* secret env var
  names (`process.env.STRIPE_WEBHOOK_SECRET`, etc.) without embedding a
  value — the expected, correct pattern.

## Summary

One real authorization defect (IDOR) was found and fixed this module
(Phase 1); a full-codebase sweep for the same bug class found no further
instances. All other Phase 5 sub-areas were confirmed unchanged from
their most recent dedicated audits, with no new code introduced in
Modules 19-20 that would create a new instance of any previously-checked
vulnerability class.
