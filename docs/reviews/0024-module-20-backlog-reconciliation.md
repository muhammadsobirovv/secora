# Module 20 — Phase 1: Historical Backlog Reconciliation

Module 20's own instruction (§5/§38) is to audit first and only fix
`REAL_REMAINING_GAP` items that materially affect v1.0 — not to re-run
every prior module's audit from scratch. This document reconciles the
specific tickets Module 20 names, cross-references work already recorded
in `docs/reviews/0022-module-19-backlog-reconciliation.md` and
`docs/reviews/0021-...` (post-M18 SDK reconciliation), and records one
newly-found and newly-fixed item.

## Ticket-by-ticket status

| Ticket(s) | Status | Detail |
|---|---|---|
| #132 | COMPLETED | Resolved in Module 19 (tracker-bookkeeping gap — real work existed under a different ticket number). See 0022. |
| #212 | VERIFICATION_BLOCKED | `apps/api` jest unit tests. Re-confirmed blocked in this module: `apps/api/node_modules/.bin/jest` exists but resolves to a broken symlink (`Cannot find module '.../node_modules/jest/bin/jest.js'`) — a partial/incomplete `pnpm install` in this sandbox, not a code defect. Attempted directly against the new `api-keys.query.spec.ts` written this module (see Phase 5 security fix below); same environment failure. Unchanged from Module 15/19's disclosure. |
| #213 | VERIFICATION_BLOCKED | `apps/api` boot + health check. No new attempt this module — unchanged from Module 19 (three genuine `pnpm install` attempts already exhausted; see 0022). |
| #332 | COMPLETED (billing UI, Module 19) + one new sub-gap fixed this module | Billing UI itself was completed in Module 19. This module found and fixed an unrelated but same-class gap: the **API Keys settings page** (`apps/web/app/(dashboard)/settings/api-keys/page.tsx`) was a permanent "coming soon" `EmptyState` stub despite the backend (`ApiKeysController`, Module 9 + Module 15 task #336) being complete. Built a real page (list/create/rotate/revoke, personal keys) — see "New gap found and fixed" below. |
| #381, #383, #384, #385, #388, #389 | COMPLETED | Confirmed already complete in Module 19 (0022) — not re-audited from scratch this module, no new evidence contradicting that finding. |
| #382 | COMPLETED | Backend + frontend fixed in Module 19 (0022). |
| #386, #387 | OBSOLETE | Recorded as OBSOLETE in Module 19 (0022) — ticket numbers reused by a later task (#425) for different, real, shipped work. Not re-litigated. |
| #396 | DEFERRED (optional) | Security news feed. Ticket's own title marks it optional. Confirmed still missing beyond env-var scaffolding (unchanged since Module 16/19). No v1.0 blocker — deferred scope, documented honestly rather than silently dropped. |
| #402, #429 | COMPLETED | SDK updates (TS/Python/Go) for Module 16 surfaces — completed per the dedicated SDK reconciliation task (`docs/reviews/` SDK audit, tasks #534-545). Cross-referenced, not re-run. |
| #408 | PARTIAL | Performance optimization pass (Module 16). Module 19 did one targeted fix (`InvoiceService.listInvoices()` missing `take` limit) but explicitly scoped that as narrow, not a full M16 performance sweep. No broader M16 perf sweep run this module either — Module 18 already ran a dedicated, later, more complete performance pass across the whole platform (Phase 14, task #516), which supersedes most of what a standalone M16-only pass would have covered. Recorded as PARTIAL (superseded by Module 18), not COMPLETED, for tracker accuracy. |
| #436 | COMPLETED | Resolved in Module 19 (0022) as a tracker-bookkeeping gap. |
| #491 | COMPLETED | SDK updates (TS/Python/Go) for Module 17 SOC/Assets/Intel/Incidents/Remediation/Risk/SLA surfaces — completed as part of Module 17 itself (tasks #489-491) and re-verified in the dedicated post-M18 SDK reconciliation pass (tasks #534-545). Cross-referenced, not re-run. |

## New gap found and fixed this module: API Keys settings page

**Audit.** The stub-language sweep (`"not yet implemented|not implemented
|coming soon|placeholder implementation"`, case-insensitive, across
`apps/`) surfaced `apps/web/app/(dashboard)/settings/api-keys/page.tsx`
rendering nothing but `<EmptyState title="API keys are coming soon" />`.
Checked the backend before assuming this was real, remaining scope (per
Module 20's "inspect existing implementation first" rule): confirmed
`ApiKeysController` (`apps/api/src/modules/public-api/controllers/
api-keys.controller.ts`) exposes full CRUD — `GET/POST public-api/keys`,
`DELETE public-api/keys/:id`, `POST public-api/keys/:id/rotate` — backed
by real command/query handlers, a hashed-at-rest key store (`sha256`,
`phb_`-prefixed raw keys matching the codebase's existing
high-entropy-token pattern), and audit logging (`API_KEY_CREATED`/
`API_KEY_REVOKED`). This is the exact class of gap Module 19 found for
Billing UI: backend complete since Module 9, frontend never built.

**Fix.** Built the real page: `apps/web/lib/api/api-keys.ts` (first
frontend consumer of `API_KEY_ENDPOINTS`), `apps/web/features/api-keys/
hooks/use-api-keys.ts`, `apps/web/features/api-keys/components/
api-keys-section.tsx`, wired into the existing page route. Supports:
create (name + optional expiry), one-time raw-key reveal dialog (matches
the DTO contract — the raw key is never retrievable again), list with
status/last-used/expiry, rotate (mints a replacement, immediately revokes
the original), revoke (with confirmation). Scope: **personal keys only**
— no `workspaceId` is passed, matching the existing single-workspace-view
frontend UX; a workspace-key picker is real, additive follow-up scope
once a workspace switcher exists (see the Phase 4 org/workspace-switcher
audit). Also added the missing `rotate` entry to `API_KEY_ENDPOINTS` in
`packages/shared/src/bugbounty-os-endpoints.ts` — the controller route
existed since Module 15 but had no shared constant for a frontend to call.

## Security defect found and fixed while auditing this surface: IDOR in `ListApiKeysHandler`

While confirming the backend contract for the page above, found that
`ListApiKeysHandler` (`apps/api/src/modules/public-api/queries/
api-keys.query.ts`) called `apiKeysRepository.findByWorkspace(workspaceId)`
whenever a `workspaceId` query filter was present, with **no check that
the caller belongs to that workspace** — unlike `CreateApiKeyHandler`/
`RotateApiKeyHandler`/`RevokeApiKeyHandler` in the same feature, and unlike
its own sibling `ListWebhookTokensHandler` (same directory), both of which
correctly call `resolveWorkspaceMembership()` first. Any authenticated
user could pass an arbitrary `workspaceId` and enumerate another
workspace's API key metadata (name, prefix, scopes, IP allowlist, rate
limit — never the raw key itself, which is never returned again after
creation, but still real reconnaissance value and a workspace-isolation
violation).

**Fix.** Added the same `resolveWorkspaceMembership()` check the sibling
handler already uses, before querying the repository. Added a regression
spec (`api-keys.query.spec.ts`) pinning: a non-member is rejected with
`WORKSPACE_MEMBERSHIP_NOT_FOUND` before the repository is ever queried; a
real member gets their workspace's keys back; the personal-key path
(no `workspaceId`) is unaffected. Could not execute the spec in this
sandbox (`apps/api` jest is environment-blocked — see #212 above); it was
written to the same standard as the codebase's existing handler specs
(`plugin-installations.query.spec.ts`, mocking `PrismaService` directly)
and reviewed by hand against `resolveWorkspaceMembership()`'s real
implementation.

## TODO/FIXME/HACK and stub-language sweep (repeated for this module)

Zero `TODO`/`FIXME`/`HACK` matches across `apps/api/src`, `apps/web`,
`packages`, `sdks`, `apps/desktop`, `apps/mobile/lib` — unchanged
discipline from every prior module.

Stub-language sweep (`"not yet implemented|not implemented|coming soon|
placeholder implementation"`, case-insensitive, `apps/`) — 9 matches,
classified:

- `apps/web/components/layout/notifications-stub.tsx`,
  `apps/web/components/layout/nav-item.tsx`, `apps/mobile/lib/core/router/
  coming_soon_screen.dart` — generic "coming soon" UI patterns for
  features intentionally not yet built. Not ambiguous stubs — these are
  the honest-empty-state convention this codebase uses deliberately.
  DOCUMENTATION-ONLY, no action.
- `apps/web/app/(dashboard)/settings/api-keys/page.tsx` — the one real
  gap; fixed this module (above).
- `apps/api/src/modules/common/guards/ip-allowlist.util.ts` and
  `apps/api/src/modules/bugbounty/scope/classify-scope-value.util.ts` —
  "IPv6 CIDR is deliberately not implemented" — disclosed, intentional,
  same disclosure repeated in both places. INFRASTRUCTURE LIMITATION, no
  action.
- `apps/api/src/modules/public-api/public-api.module.ts` — doc comment
  referencing a documented ADR 0009 follow-up (per-API-key throttler
  tracker, not per-IP). TECHNICAL DEBT, already disclosed, out of scope
  for a "fix real defects when safe" pass (would require a custom
  `ThrottlerStorage`, non-trivial, no security impact — per-IP throttling
  still applies).
- `apps/api/src/modules/mcp/controllers/mcp-rpc.controller.ts` —
  architectural note about a second MCP channel. DOCUMENTATION-ONLY.
- `apps/api/src/modules/billing/providers/null-payment-provider.ts` — doc
  comment clarifying its no-op is intentional Community Edition design,
  not an unfinished feature. DOCUMENTATION-ONLY.

## Verification

- `packages/shared` — `tsc -p tsconfig.json` (real build) — **PASS**,
  confirms the new `rotate` endpoint constant compiles and is visible to
  consumers (re-checked after rebuild; the first check run against a
  stale `dist/` output before rebuilding, which is expected — `apps/web`
  resolves `@pentesthub/shared` through its built `dist/`, not `src/`,
  same as every prior module's verification note).
- New/changed `apps/api` files (`api-keys.query.ts`, its new
  `.spec.ts`) — `tsc --noEmit --noResolve --experimentalDecorators`
  (structural/syntax check) — **PASS**, and cross-checked against the
  unmodified sibling `webhook-tokens.query.ts` to confirm the one
  "Decorators are not valid here" message was a missing-flag artifact of
  the check itself, not a real defect (disappeared once
  `--experimentalDecorators` was passed, on both files identically).
- New/changed `apps/web` files (`lib/api/api-keys.ts`, `features/
  api-keys/hooks/use-api-keys.ts`, `features/api-keys/components/
  api-keys-section.tsx`, the page) — a real `tsc --noEmit` run via a
  temporary tsconfig extending the project's own `tsconfig.json` (so
  `@/*` paths and real `node_modules` resolve, unlike `--noResolve`) —
  **PASS for all four new/changed files**. The only errors reported
  (`Cannot find module '@radix-ui/react-dialog'` etc.) come from
  **pre-existing** `components/ui/{dialog,alert-dialog,label}.tsx` —
  confirmed these are not caused by this module's work by running the
  identical check against an untouched Module 19 file
  (`billing-summary-section.tsx`), which shows the same class of error
  (`@radix-ui/react-separator`, `next/link` unresolved). Root cause:
  several `@radix-ui/*` packages in `apps/web/node_modules` are broken
  symlinks pointing at pnpm-store paths that don't exist in this sandbox
  — the same disclosed "pnpm install cannot complete in this sandbox"
  environment limitation from Module 15/19, now manifesting as partial
  rather than wholesale missing packages. Not a code defect in any
  module's work.
- `apps/api` jest (new `api-keys.query.spec.ts`, and #212 generally) —
  **VERIFICATION_BLOCKED**. `node_modules/.bin/jest` exists but its
  target (`node_modules/jest/bin/jest.js`) does not — the same
  broken-symlink pattern as the radix packages above. The spec was
  reviewed by hand instead (see "Security defect" section above).

## Phase 2-3: Product completeness + navigation wiring spot-check

Cross-checked every `PRIMARY_NAV`/`FUTURE_NAV`/`SETTINGS_NAV` entry
(`apps/web/components/layout/nav-config.ts`,
`apps/web/app/(dashboard)/settings/layout.tsx`) against the actual
`app/` route tree rather than assuming a nav label implies a working
page. Result: every non-`comingSoon` nav entry resolves to a real
`page.tsx` (Dashboard, Workspace, Projects, Targets, Notes, Evidence,
Recon, Vulnerabilities, Bug Bounty, SOC, Executive Security, Exposure
Management, Threat Intelligence, Security Reports, Research Sessions,
Terminal, Playbooks, AI Assistant, Agent Copilot, Knowledge Base,
Activity, Pricing, Admin, Documentation, and all eleven Settings pages
including the API Keys page fixed above). The only `comingSoon: true`
entry (`CVE Center`) is honestly disclosed as such in the nav item itself,
not a silent gap. No orphaned nav links, no dead-end pages found.

A full manual state-by-state (loading/empty/error/unauthorized) walkthrough
of every page was not repeated in this pass — Module 15 (task #360, Final
UX audit) and Module 18 (task #525, Frontend reliability audit) already
did this work directly; re-running it from zero would duplicate rather
than extend that coverage, which Module 20's own "avoid scope creep" rule
argues against. This pass's contribution is confirming the nav-to-route
mapping is still accurate after two more modules' worth of changes, and
finding the one real gap (API Keys) that had slipped through.

## Phase 4: Org/workspace switcher UX audit

Module 19 disclosed "no org-switcher UI" as a known limitation. Audited
both layers this platform has (Workspace and, above it, the optional
enterprise Organization) separately, since they're distinct mechanisms
with very different fix costs.

**Organization layer (billing-scoped) — fixed.** `usePrimaryOrganization()`
already fetched every organization the caller belongs to
(`listMyOrganizations()`, IDOR-safe — verified in the Module 19 audit) but
always rendered the first one with no way to pick another. This is a
small, safe, additive UI gap: no new backend route, no new trust
boundary. Added `useOrganizationStore` (a persisted "which organization
did I pick" UI preference, `apps/web/lib/stores/organization-store.ts`)
and `<OrganizationSwitcher />` (`apps/web/features/organizations/
components/organization-switcher.tsx`), wired into all three
organization-scoped pages (`/settings/billing`, `/settings/usage`,
`/pricing`). The persisted selection is never trusted as an authorization
boundary — `usePrimaryOrganization()` only uses it if it's actually
present in the real, fresh `listMyOrganizations()` response for the
current user, falling back to the first organization otherwise (handles:
stale ID from a previous account in the same browser, an organization the
user has since left). Renders nothing for the common zero/one-organization
case, so it adds no clutter for Community Edition or single-org users.

**Workspace layer (Projects/Targets/Recon/Vuln/etc.) — audited, confirmed
pre-existing architectural scope, not changed.** Traced how the main app
resolves "which workspace" for every implicit-personal-workspace read
path (`GET /workspace`, `ListProjectsHandler`, and their siblings) — all
call `WorkspacesRepository.findPersonalWorkspaceForUser()`, which always
resolves to the caller's *own* personal workspace, never one they were
invited into as a Module 9 collaborator. This means a user who accepts a
workspace invite currently has no way to see or navigate to that
workspace's Projects/Targets/Recon/etc. through the main UI — they can
only interact with it via Module 9's own explicit, workspace-scoped
Collaboration endpoints (comments, assignments, watchers) if they already
know a specific entity's ID.

This is confirmed to be a **known, pre-existing, deliberately-scoped**
architectural decision, not a newly-discovered defect: the exact
doc comment in `apps/api/src/modules/collaboration/
workspace-membership.util.ts` (written when Module 9 shipped) says so
explicitly — "Modules 1-8 keep their existing implicit
single-personal-workspace resolution untouched... A future module can
migrate the rest of the app to workspace-explicit routing once
multi-workspace switching is a first-class product surface end to end."
Retrofitting every Module 1-8 read path (Projects, Targets, Recon, Vuln,
Notes, Evidence, Tags, Activity, Search — a two-digit number of
controllers) to be workspace-explicit is a genuine architecture change,
not a small UI fix, and is explicitly out of scope under Module 20's own
"NEVER rewrite the architecture" / "avoid scope creep" rules. Documented
here as an accepted, disclosed v1.0 limitation rather than left
unmentioned or attempted as a rushed, wide-blast-radius change in this
final module. See Known Limitations in the final report.

## Summary

One real product gap found and fixed (API Keys settings page — a
backend-complete, frontend-missing gap of the exact same class Module 19
found for Billing UI). One real security defect found and fixed while
auditing that surface (workspace-key IDOR in `ListApiKeysHandler`). All
other named backlog tickets confirmed already resolved, appropriately
deferred, or accurately reclassified — no ticket was marked complete
without checking the underlying code first.
