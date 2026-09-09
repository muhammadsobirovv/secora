# Module 20 — Phases 8-9: Billing Finalization & Community Edition Guarantee

## Phase 8: Billing finalization

An audit sub-agent was used to spot-check the billing module for
release-readiness gaps (pricing plan definitions, unguarded paid
features, Stripe test/live configuration, stub markers, changelog
coverage). Findings and resolution:

### Pricing plans — confirmed complete

`packages/shared/src/plan-defaults.ts` (`DEFAULT_PLAN_SEEDS`) is the
single source of truth: FREE (self-hosted, unlimited), CLOUD_FREE, PRO
($49/mo), TEAM ($149/mo), ENTERPRISE (contact sales), each with concrete
`limits` (AI_TOKENS, AI_REQUESTS, STORAGE_BYTES, SCANNER_JOBS,
RECON_JOBS, etc.) and `features` flags (sso, scim, advancedRbac, sla,
customDomain). Consumed by `apps/api/prisma/seed-plans.ts` (idempotent
upsert by `Plan.tier`) and read at runtime by `EntitlementService`/
`SubscriptionService`/`QuotaService`. No changes needed — this was
already complete.

### Unenforced RECON_JOBS/SCANNER_JOBS quotas — real gap, fixed

The audit found that `QuotaService.check()`/`.enforce()` — documented in
its own doc comment as "the enforcement entry point every
resource-consuming command handler is expected to call" — had **zero
callers** outside the billing module itself. Concretely,
`CreateReconJobHandler` and `CreateVulnScanJobHandler` (the only two
places `RECON_JOBS`/`SCANNER_JOBS` usage is generated) never called
`QuotaService` or recorded usage against those resource types at all,
despite both having concrete per-plan limits configured in
`plan-defaults.ts` since Module 15. A PRO/TEAM/ENTERPRISE customer's
configured job-count limit was silently unenforced, and the `/usage`
dashboard's RECON_JOBS/SCANNER_JOBS bars would always read zero. (By
contrast, AI chat's `AI_TOKENS`/`AI_REQUESTS`/`AI_COST_CENTS` budget
enforcement, via `AiBudgetEnforcerService`, was already correctly wired.)

This is a narrow, single-call-site-per-resource gap (unlike the Phase 6
quota check-then-act TOCTOU race, which spans every metered call site
platform-wide) — safe to fix in this pass:

- **`QuotaService.enforceForWorkspace(workspaceId, userId, resourceType)`**
  (new method) resolves the workspace's `organizationId` (the same gap
  `AiBudgetEnforcerService.resolveScope()` already solves for AI
  budgets — a command handler only ever has `workspaceId` in hand, but
  `QuotaService.resolveLimit()`'s `Plan.limits` fallback needs
  `organizationId`), calls the existing `enforce()`, and returns the
  resolved `organizationId` so the caller's post-success
  `UsageService.record()` call can tag the counter correctly without
  re-deriving it.
- **`QuotaService` moved from `BillingModule` (controller-bearing,
  API-process-only) to `BillingCoreModule`** (already imported by the
  worker process for `AiBudgetEnforcerService`) so `ReconModule`/
  `VulnModule` — both API-process-only HTTP modules, never part of the
  worker's DI graph — can import the lightweight core module without
  pulling in billing's controllers. `BillingModule` now re-exports
  `QuotaService` from the import instead of redeclaring it as its own
  provider (previously two independent singleton instances would have
  existed; harmless functionally since the service is stateless, but
  bad hygiene).
- **`CreateReconJobHandler`/`CreateVulnScanJobHandler`** each gained a
  `QuotaService`/`UsageService` dependency, an
  `enforceForWorkspace(workspaceId, userId, 'RECON_JOBS' | 'SCANNER_JOBS')`
  call right before the job insert (throws `QUOTA_EXCEEDED`, 429, before
  any write if the org is over its hard limit), and a best-effort
  (`.catch()`, not awaited-and-thrown) `usage.record()` call right after
  the job is created — mirroring `AiBudgetEnforcerService.recordUsage()`'s
  "a metering write failing must never undo already-accepted work"
  posture exactly.
- A workspace with no `organizationId` and no explicit WORKSPACE-scoped
  `QuotaPolicy` row resolves to unlimited — the same zero-configuration
  Community Edition default every other Module 15 enforcement mechanism
  has, by construction (see `resolveLimit()`'s own doc comment). Self-
  hosted/Community users see no behavior change; only orgs with a real
  Plan/QuotaPolicy limit configured are affected, and only by having a
  previously-silent limit start actually being enforced.
- Regression tests added to both existing spec files: quota-exceeded
  rejects before touching the repository, and a successful job records
  usage against the resolved `organizationId`.

**Files changed**: `apps/api/src/modules/billing/quota.service.ts`,
`apps/api/src/modules/billing/billing-core.module.ts`,
`apps/api/src/modules/billing/billing.module.ts`,
`apps/api/src/modules/recon/recon.module.ts`,
`apps/api/src/modules/recon/commands/create-recon-job.command.ts`
(+ its spec), `apps/api/src/modules/vuln/vuln.module.ts`,
`apps/api/src/modules/vuln/commands/create-vuln-scan-job.command.ts`
(+ its spec).

### Stripe test/live mode — documented, not a defect

`STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/`STRIPE_PUBLISHABLE_KEY` are
single env var slots (no `_TEST`/`_LIVE` split) — mode is implicit in
whichever key (`sk_test_...` vs `sk_live_...`) the operator configures.
This is a standard, common pattern (matches Stripe's own recommended
single-environment-per-deployment model) and not a defect; no dedicated
"go-live checklist" doc exists beyond `docs/architecture/stripe-webhook.md`
(architecture/signature-verification only). Noted as a documentation gap
to close in Phase 18-21 (documentation finalization), not a code issue.

### TODO/FIXME sweep, changelog coverage

Clean — no stub markers in `apps/api/src/modules/billing/`.
`CHANGELOG.md` and `docs/releases/module-15-release-notes.md` both
document billing as complete.

## Phase 9: Community Edition guarantee — re-verified, holds

Re-audited (not re-built) per the standing dedicated audits from Modules
14 and 15 (`docs/reviews/0007-module-14-community-edition-guarantee.md`,
`docs/reviews/0013-module-15-community-edition-guarantee.md`):

- **Edition system**: `EditionService`
  (`apps/api/src/modules/infrastructure/edition.service.ts`),
  `@RequiresEdition('enterprise')` decorator, `EditionGuard` (global
  `APP_GUARD`, no-op unless the decorator is present).
  `PENTESTHUB_EDITION` defaults to `community`; `isEnterpriseFor()` never
  makes a network call.
- **Core guarantee holds**: `@RequiresEdition` appears in exactly one
  controller file repo-wide —
  `apps/api/src/modules/enterprise/controllers/organizations.controller.ts`.
  Spot-checked auth, recon, vuln, bugbounty, and AI controllers — none
  carry the decorator, confirming every core pentesting feature (auth,
  recon, vuln scanning, bug bounty, AI assistant, reporting) works fully
  without a license key.
- **Correctly Enterprise-gated**: tenant billing contact, tenant
  branding/custom-domain, tenant usage — all on the multi-tenant
  Organizations surface in `organizations.controller.ts`. SSO/SCIM/
  advanced-RBAC are plan `features` flags (true only on the ENTERPRISE
  tier in `plan-defaults.ts`), not route-level edition guards elsewhere
  — consistent with how Module 14 originally designed this.
- **Single source of truth**: `packages/shared/src/plan-defaults.ts`
  (plan-tier features) and `EditionService` (runtime Community-vs-
  Enterprise switch) — unchanged, no drift found.
- **TODO/FIXME sweep** of the edition service/guard/decorator: clean.

**Conclusion: Community Edition guarantee holds, no violations found.**
No code changes required for Phase 9 — this was a verification pass,
not a fix.

## Verification

Both new/changed billing/recon/vuln files —
`tsc --noEmit --noResolve --experimentalDecorators` structural check —
**PASS**, zero errors beyond the same disclosed environment-only
TS2307 (module resolution) / TS2580 (ambient Node types) noise
documented in `0026-module-20-quota-race-webhook-ordering.md`. A real
`tsc -p tsconfig.check.json --noEmit` pass is not feasible for
`apps/api` in this sandbox (see that same doc's Verification section —
stale/absent generated Prisma Client types block it identically for
untouched files). `apps/api` jest — **VERIFICATION_BLOCKED**, same
broken-symlink sandbox limitation disclosed throughout this project;
both new regression-test blocks were written and manually traced against
the real handler implementations they test.
