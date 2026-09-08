# Module 19 — Historical Backlog Reconciliation

Part of the Module 19 ("Product Completion, Monetization & Launch
Readiness") baseline audit. Scope: reconcile every historical backlog
item the Module 19 brief named explicitly (#132, #332, #381-389, #396,
#408, #436, #212, #213) against the actual state of the repository, using
the same discipline established by `docs/reviews/0021-post-m18-sdk-reconciliation.md`
— verify from source, not from a prior task's title; mark unverifiable
items `VERIFICATION_BLOCKED`; never claim complete without evidence;
disclose ambiguous history rather than silently resolving it either way.

## Method

For every item: `Grep`/`Read` the actual files the ticket title implies,
confirm wiring (module registration, controller routes, frontend
consumption), and only then assign a status. Where a later task's title
explicitly referenced the same ticket numbers (e.g. "#425 — Implement
Public Sharing #386-387"), both the original and the later task were
read to determine whether the original scope was actually built under a
new number, or whether the number was reused for different work.

## Status legend

- **COMPLETED** — verified present, wired, and functioning as described.
- **PARTIAL** — some real work exists but the original scope isn't fully covered.
- **MISSING** — no implementation found.
- **DEFERRED** — real, scoped, but intentionally not attempted this pass (too large for an incremental fix, or explicitly optional).
- **OBSOLETE** — the ticket number was reassigned to different, unrelated (but real) work; the originally-titled scope was never built and isn't currently planned.
- **VERIFICATION_BLOCKED** — could not be verified in this environment; reasons and attempts disclosed.

## Reconciliation table

| # | Title | Status | Evidence |
|---|---|---|---|
| #132 | Phase 1 BYOK: build/lint/typecheck/test verification loop | **COMPLETED** (tracker bookkeeping fix) | The work exists under task #218 ("Phase 1 BYOK verification loop (#132)"), already marked completed. #132 itself was never flipped when #218 closed. Fixed this module. |
| #332 | Billing UI — /billing, /pricing, /settings/billing | **COMPLETED** (built this module) | `apps/web/app/(dashboard)/pricing`, `.../settings/billing`, `.../settings/usage`, plus `lib/api/billing.ts`, `lib/api/organizations.ts`, `features/billing/*`, `features/organizations/*`. No separate top-level `/billing` route — `/settings/billing` serves that purpose. `/pricing` lives inside the authenticated dashboard, not as a public page (see Frontend section of the final report for why). |
| #381 | AI Security Analyst agent extensions | **COMPLETED** | `apps/api/src/modules/bugbounty/ai/bugbounty-ai-assistant.service.ts` (+ spec) exists and is wired into the bugbounty module. |
| #382 | Finding validation workflow states | **COMPLETED**, with a real regression found and fixed | `BugBountyFindingStage` (packages/shared/src/bugbounty.ts) includes `DRAFT`/`INFORMATIVE`/`ACCEPTED`/`REJECTED` beyond the original lifecycle states — the backend side of this ticket shipped. However, `apps/web/features/bugbounty/components/bugbounty-badges.tsx`'s `STAGE_CLASS`/`STAGE_LABEL` `Record`s were never updated to match, which is a TS2739 compile error (confirmed via a real `tsc --noEmit -p tsconfig.json` run against this repo's actual `tsconfig.json`, using the partial `node_modules` already present — `@pentesthub/shared` resolves via the pnpm workspace symlink even though most third-party deps don't). The same gap existed for `ScopeClassification`'s `REVIEW_NEEDED`/`DEPRECATED` (Module 9). Both fixed in commit `92628ac`. |
| #383 | Evidence workspace enhancements | **COMPLETED** | `apps/api/src/modules/evidence/*` — commands, controllers, repository, mappers, queries, events all present. |
| #384 | Report Builder template expansion | **COMPLETED** | `apps/api/src/modules/bugbounty/reports/bug-report-template-renderer.ts` (+ spec). |
| #385 | Bug Bounty Submission + reward tracking | **COMPLETED** | Built under tasks #414/#415 — `bugbounty-submissions.controller.ts`, `submission-lifecycle.commands.ts` confirmed present and wired. |
| #386 | Research analytics extensions | **OBSOLETE** — see below | No research-analytics-dashboard-extensions subsystem exists anywhere in the repo (grepped for "research analytics", "ResearchAnalytics", relevant service/controller names — nothing). This ticket number was later reused by task #425 ("Implement Public Sharing #386-387"), which built Public Sharing (share links) — genuinely completed, real, tested (`docs` show a dedicated security review, task #446). That is different, real work, not the originally-titled feature. The original scope was never built and there is no evidence it is currently planned. |
| #387 | Security research notebook | **OBSOLETE** — same reassignment as #386 | Same finding: no distinct "security research notebook" subsystem exists; ticket number #387 was reused by the same #425 Public Sharing task. |
| #388 | Terminal workspace + safe command execution | **COMPLETED** | Built under #416/#417 — `apps/api/src/modules/terminal/ad-hoc-command.service.ts` (+ spec), `terminal.controller.ts` confirmed. Routes every command through the Scope Engine / Approval Gate chain per the file's own architecture (consistent with the project's "single authoritative tool-execution path" standard from Module 18 Phase 9). |
| #389 | Research playbooks + visual builder | **COMPLETED** | Built under #418/#419 — `apps/api/src/modules/playbooks/*` (execution service, controllers, seed data) confirmed present and wired. |
| #396 | Security news feed (optional) | **DEFERRED / MISSING** | Only env-var scaffolding exists: `SECURITY_NEWS_PROVIDER` / `SECURITY_NEWS_FEED_URLS` in `env.validation.ts`, defaulting to `'none'`. No service, controller, or frontend consumes them — grepped the entire `apps/api/src` tree, zero other references. The ticket's own title marks it optional. Building an RSS poller service + storage model + controller + frontend is real, non-trivial scope, not attempted in this incremental pass per the Module 19 spec's "implement only if small/safe, otherwise document as remaining scope" instruction. |
| #408 | Performance optimization pass | **PARTIAL** | One targeted, verified fix applied within the billing/usage scope Module 19 actually covers: `InvoiceService.listInvoices()` had no `take` limit — `BillingService.getSummary()` (called on every `/billing`/`/settings/billing` page load) would return an organization's entire invoice history unbounded. Capped at 50, most-recent-first (commit `2aac276`). No Module-16-wide performance sweep was attempted — that would duplicate Module 18's already-completed dedicated performance pass (#516, #529 etc.) rather than add new value, and the Module 19 spec explicitly asks for "targeted fixes only, not a repeat of Module 18." |
| #436 | Full test/verification pass across all surfaces | **COMPLETED** (tracker bookkeeping fix) | Same pattern as #132: the work exists under tasks #457 ("Attempt to run apps/api jest tests"), #458 ("Lightweight performance audit"), #459 ("Finish SDK/CLI verification + re-check typecheck"), all already marked completed as part of Module 16's closure. #436 itself was never flipped. Fixed this module. |
| #212 | apps/api unit tests (jest) | **VERIFICATION_BLOCKED** | See "Environment verification attempts" below. |
| #213 | apps/api boot + health check | **VERIFICATION_BLOCKED** | Same root cause as #212. |

## Environment verification attempts (#212, #213)

Three genuine, disclosed `pnpm install` attempts were made in this
session, each via `npx pnpm@9` (the sandbox has no globally-installed
`pnpm`; `corepack enable` fails with `EACCES`, consistent with the
no-root/no-sudo constraint already documented in prior modules):

1. `pnpm install --frozen-lockfile` (full monorepo, 1554 packages) — ran
   twice in a row (170s cap each), progressed from 0 to 3 packages
   reused between runs.
2. `pnpm install --frozen-lockfile --filter web...` (586 packages) — ran
   three times in a row; by the third attempt, 32 of 586 packages were
   downloaded/added.
3. `pnpm install --frozen-lockfile --filter api...` (1138 packages) —
   one attempt; 10 of 1138 reused after ~170s.

Registry connectivity itself is confirmed working (`curl -sI
https://registry.npmjs.org/next` returns `200`), but the effective
download+extract throughput in this sandbox is roughly one package per
10-15 seconds — a 500-1500 package dependency graph would take multiple
hours, far beyond what a single tool call (capped at ~178s regardless of
the timeout requested) or a realistic number of sequential calls can
absorb in this session.

A background/detached install (`nohup ... &`, `disown`) was also tried
once, on the theory that it could keep running between tool calls. It
did not: the log file it wrote to was empty and `node_modules` had not
grown at the start of the next call, confirming this environment does
not persist background processes across separate tool invocations.

Given this, `apps/api`'s jest suite (#212) and a real boot + health-check
attempt (#213) remain **VERIFICATION_BLOCKED** — not silently skipped,
not claimed as passing. This is the same category of environmental
constraint documented in Module 18 (`node_modules/@nestjs` having only 1
entry) and the SDK reconciliation task (no Go toolchain), just for a
different dependency.

### What partial verification *was* possible

- `packages/shared`: `tsc` build — **PASS** (genuinely ran, zero errors).
- New `apps/web` files (this module's billing/organizations/pricing/usage
  code): run through `tsc --noEmit --noResolve` (skips module resolution
  entirely, still catches syntax/JSX/structural errors) — **PASS**, zero
  non-module errors.
- A real `tsc --noEmit -p tsconfig.json` run against `apps/web`'s actual
  config (using the partial `node_modules` present, where
  `@pentesthub/shared` resolves via the pnpm workspace symlink even
  though most third-party packages don't) surfaced the pre-existing
  `bugbounty-badges.tsx` defect above — a genuine, useful signal despite
  the incomplete install, and the reason that defect was caught and
  fixed rather than missed.

## Summary

Of the 15 items reconciled: 10 are genuinely **COMPLETED** (2 of those
via a tracker bookkeeping fix, not new work), 2 are **OBSOLETE** (ticket
numbers reassigned to different real work — original scope was never
built), 1 is **DEFERRED/MISSING** (explicitly optional, real remaining
scope), 1 is **PARTIAL** (one targeted fix applied, no full sweep), and 2
are **VERIFICATION_BLOCKED** (environment, not code).
