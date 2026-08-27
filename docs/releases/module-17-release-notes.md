# Module 17 Release Notes — Security Operations Center, Threat Intelligence & Autonomous Research Platform

## Features added

**Security Asset & Continuous Attack Surface Monitoring** — `SecurityAsset`
ownership model plus scheduled/event-driven attack-surface scans that emit
`AttackSurfaceEvent` rows, reusing the existing job-queue and EventBus
infrastructure rather than a new scheduler.

**Change Intelligence** — correlates successive attack-surface scans of the
same target into "potential exposure" signals (new open port, new
subdomain, expired cert, etc.) without a separate diffing engine — built on
the same `AttackSurfaceEvent` stream.

**Threat Intelligence Engine** — `ThreatActor`/`ThreatCampaign`/`Indicator`
data model, a provider abstraction (`ThreatIntelProviderService`) with a
Community-Edition-friendly public-feed adapter (CISA KEV, no API key
required), and a manual STIX 2.1 Bundle import path (`StixTaxiiService`)
for any workspace that wants richer or paid feeds without the platform
requiring one. See [`docs/threat-intelligence.md`](../threat-intelligence.md).

**Threat matching (`ThreatMatch`)** — correlates active indicators against
a workspace's known targets/assets, feeding both the SOC dashboard and the
security report builder.

**Incident Management** — full lifecycle (`OPEN → INVESTIGATING →
CONTAINMENT → ERADICATION → RECOVERY → CLOSED`/`REOPENED`), linked
playbook executions, evidence attachment via the existing Evidence
infrastructure (no new evidence store), and an AI-assisted investigation
workflow. See [`docs/incidents.md`](../incidents.md).

**AI SOC Analyst & AI Investigation Workflow** — reuses the existing AI
provider abstraction and tool-calling framework from Modules 5/11; every
free-text input reaching a prompt (analyst goal, scan-tool output,
indicator description) is wrapped with the shared `fenceUntrusted()`
utility (task #493) rather than concatenated raw.

**Defensive Security Playbooks** — extends the existing Playbook engine
(Module 16) with SOC-specific playbook templates rather than a second
execution engine.

**Risk Engine v2** — extends (does not replace) the Module 16 Risk Engine
with prioritization scoring (score/tier/factors/recommended priority) for
the exposure-management workflow.

**Remediation tracking** — `RemediationTask` lifecycle with a verification
step, automation-rule-driven creation from incidents/findings/SLA breaches
via the existing EventBus. See [`docs/remediation.md`](../remediation.md).

**SLA Engine** — auto-derives due dates and breach status per incident
severity/status from workspace-configurable policy, no manual deadline
entry required. See [`docs/sla.md`](../sla.md).

**Security Metrics & dashboards** — MTTD/MTTR/MTTV/SLA-compliance,
computed on request from existing rows (no separate metrics store), backing
both the composed `/soc` dashboard and the `/executive-security` trend
view. See [`docs/risk.md`](../risk.md) and [`docs/soc.md`](../soc.md).

**Platform surfaces** — REST API (`/api/v1/soc,/assets,/intel,/incidents,
/remediation,/risk,/sla`), Swagger, CLI commands, and TS/Python/Go SDK
updates (tasks #489-#491), all built on the existing API/CLI/SDK
conventions from prior modules — no new API framework, no new SDK
generation pipeline.

**Knowledge Graph, AI Memory, Global Search, Notification, Automation Rules
extensions** — every one of these reuses its Module 16 (or earlier)
infrastructure directly; none introduces a parallel graph store, memory
store, search index, notification channel, or execution engine, per the
standing "do not duplicate infrastructure" constraint for this module.

## Security audit summary (task #492 + #493)

A dedicated pass covered IDOR, SSRF, XSS, CSRF, SQL/command injection,
path traversal, upload handling, SSE auth, tenant isolation, indicator
poisoning, STIX parsing safety, feed poisoning, webhook abuse, AI prompt
injection, AI tool abuse, AI memory leakage, graph leakage, automation
privilege escalation, and SLA/remediation authorization. Findings fixed
in place (not merely disclosed):

- Two IDOR-class gaps where a `correlationInsight`/similar lookup filtered
  by `projectId` alone, without `workspaceId` — fixed in
  `IncidentsService`/`RemediationService`/`AiSocAnalystService`/
  `AutomationRulesService` (task #492) and, found again in
  `IncidentInvestigationService`'s `CORRELATION_REVIEW` step, fixed the
  same way (task #493).
- Centralized the ad hoc prompt-injection fencing pattern task #492
  introduced into a shared, documented utility
  (`common/utils/ai-prompt-fencing.util.ts`) and applied it to both AI
  prompt builders that exist in this module (task #493).
- `IncidentPlaybooksService.listForIncident` — unbounded N+1 sequential
  resolution replaced with a capped (`take: 50`), concurrent (`Promise.all`)
  resolution (task #494).
- 6 composite indexes added/widened (`ThreatActor`, `ThreatCampaign`,
  `ThreatMatch`, `Incident` ×2, `RemediationTask` ×2, `SlaEvent`) to match
  the query shapes the dashboard, matching, and breach-detection code
  paths actually use — one narrower pre-existing index dropped in favor
  of a widened superset rather than kept redundantly (task #495).

STIX/TAXII import, the one user-controlled bulk-ingest path in this
module, treats every object as untrusted external data by construction:
non-Bundle payloads and malformed `objects` arrays are rejected outright;
individual malformed/oversized/unrecognized objects are counted as
rejected rather than crashing or corrupting the import; imported content
is always workspace-scoped (never global); string fields are
length-capped. Covered by `stix-taxii.service.spec.ts` (task #496).

No live prompt-injection vulnerability via threat-intel content was found
— no current AI-prompt builder consumes threat-intel `description`/
`aliases`/`summary` fields directly. The fencing utility exists
preventatively, documented as such, so the first builder that does
consume that content inherits the protection by construction rather than
by remembering to add it later.

## Tests (task #496)

7 new spec files covering SLA calculation, automation-rule authorization,
AI SOC Analyst prompt construction, threat matching, threat-intel provider
failure handling (network outage, non-OK HTTP, partial-import accounting,
per-run import cap), STIX/TAXII parsing safety, and SOC dashboard
workspace-resolution auth. All verified via `ts.transpileModule()` (the
real TypeScript parser, full syntax validation) rather than a live `jest`
run — see "Known gaps" below for why.

## Community Edition guarantee

No paid threat-intelligence subscription is required anywhere in this
module. `ThreatIntelProviderService` defaults to no provider configured
(explicit `THREAT_INTEL_PROVIDER_NOT_CONFIGURED` error on refresh, never a
silent no-op); the one built-in feed adapter (CISA KEV) is free and
requires no API key; manual/local import via STIX bundle or the
`POST /intel/indicators` endpoint works with zero external dependency.

## Verification loop (task #498)

Re-attempted every check task #495/#496 had left as BLOCKED BY
ENVIRONMENT, plus two checks that hadn't been run yet, and root-caused
the failures rather than re-stating them unchanged:

- **`packages/shared` — PASSED, for real.** Both `tsc --noEmit` and a
  full `tsc` emit build completed cleanly (exit 0, JS output produced)
  against the M17 additions (`ai.ts`, `bugbounty.ts`,
  `knowledge-graph.ts`, `module17-endpoints.ts`, `soc-threat-intel.ts`).
  This package has no `@nestjs/*` dependency, so it isn't affected by
  the `apps/api` finding below — this is a genuine, complete,
  type-checked pass, not a substitute.
- **All 40 Module 17 files (`apps/api` + `packages/shared`) — PASSED
  real syntax validation.** `ts.transpileModule()` (the actual
  TypeScript parser) reported zero syntax errors across every new or
  modified file from tasks #492-#497.
- **`apps/api` full `tsc --noEmit` — completed (did not time out this
  time) but is not usable as a signal, and here is why.** It reports
  ~2,574 errors, the overwhelming majority `Cannot find module
  '@nestjs/...'` / `'@opentelemetry/...'` / similar. Traced the root
  cause: `apps/api/node_modules/@nestjs/common` resolves (via symlink)
  to a pnpm-store directory that has some subfolders
  (`decorators/`, `interfaces/`, `services/`, etc.) but **no
  `package.json` and no root `index.js`/`index.d.ts`** — the package
  was never fully installed, the exact same defect class already
  confirmed for `prisma` and `jest` in tasks #495/#496, now confirmed
  to extend to `@nestjs/common` and, by inference, the rest of the
  `@nestjs` family every module in this codebase depends on. This is
  a sandbox-wide dependency-installation defect, not specific to
  Module 17 and not fixable from application code.
  Spot-checked the four non-"Cannot find module" errors that touched
  Module 17 files, to rule out a real bug hiding in the noise — all
  four are downstream artifacts of the same defect, not code bugs:
  `AuditEventType` "missing" `INCIDENT_CREATED`/`INCIDENT_STATUS_CHANGED`/
  `INCIDENT_ASSIGNED` (all three are present in `schema.prisma` at
  lines 1572-1574 — the generated Prisma client is stale, same root
  cause as the broken `prisma` CLI); `IncidentTimelineEventType`
  "missing" `PLAYBOOK_EXECUTED` (present at line 6852, same stale-client
  cause); `PrismaClient` "missing" `.slaPolicy` (the `SlaPolicy` model
  exists at line 3973, same cause, and this one is in
  `enterprise-analytics`/`enterprise-reporting`, pre-existing code
  Module 17 never touched); `AppException` "missing" `.message` (it
  extends `HttpException extends Error`, which trivially has
  `.message` — the error only appears because `HttpException` itself
  can't resolve from the broken `@nestjs/common`). None of the four is
  a real defect.
- **`eslint` is also broken in this sandbox — new finding this pass.**
  `./node_modules/.bin/eslint --version` fails with `Cannot find module
  '@eslint-community/eslint-utils'`; that package does not exist
  anywhere under `node_modules/.pnpm` in this sandbox. Same defect
  class as `prisma`/`jest`/`@nestjs/common` above. No lint pass was
  possible for any file in this session, Module 17 or otherwise.
- **`prisma`/`jest` CLIs re-confirmed broken**, unchanged from
  tasks #495/#496 — re-checked rather than assumed still-broken;
  same empty/incomplete pnpm-store package directories found again.
- **Net assessment**: the syntax of every Module 17 file is confirmed
  valid, and the one part of the change set with a working toolchain
  (`packages/shared`) type-checks and builds cleanly. `apps/api`'s
  type-correctness and the 7 new spec files' pass/fail status remain
  genuinely unverified in this sandbox — not because the code is
  suspect, but because `tsc`, `eslint`, `jest`, and `prisma` are all
  broken installs here. A environment with a working `pnpm install`
  should be able to run all four cleanly; this is disclosed as a
  sandbox limitation, not swept under a "PASSED".

## Known gaps

- **`prisma` CLI is broken in this sandbox** — confirmed this pass:
  `apps/api/node_modules/prisma` resolves (via symlink) to a pnpm-store
  package directory whose `dist/cli` folder is entirely empty, with no
  `package.json` present — the package's contents were never actually
  installed, not a path-resolution issue. `prisma validate`/`generate`
  could not be run. Substituted with a structural schema-field-reference
  check (every field referenced in a new `@@index` actually exists on its
  model) and manual comparison of `schema.prisma` against
  `migration.sql`.
- **`jest` CLI is also broken in this sandbox** — confirmed this pass:
  same class of defect as `prisma` (`apps/api/node_modules/jest` symlinks
  to a pnpm-store directory that does not contain the expected package
  contents). No live test run was possible for the 7 new spec files (or
  any pre-existing Module 17 spec file). Substituted with
  `ts.transpileModule()` syntax validation (confirms every file parses as
  valid TypeScript; does not confirm assertions pass, mocks are wired
  correctly, or cross-file types resolve) — disclosed as the best
  available substitute, not equivalent to a real test run.
- A full-program `tsc --noEmit` typecheck of `apps/api` **did complete**
  in this pass (unlike earlier modules' timeout reports) but is not a
  usable signal here — see "Verification loop" above: it surfaces
  ~2,574 errors that trace back to `@nestjs/common` and most of its
  sibling packages being incomplete pnpm-store installs (missing
  `package.json`/entry points), the same defect class as `prisma` and
  `jest`. `eslint` is broken the same way (missing
  `@eslint-community/eslint-utils`). `packages/shared`, which has no
  `@nestjs` dependency, typechecks and builds cleanly and is a genuine
  PASSED result.
- The Go toolchain remains absent from this sandbox (consistent with
  prior modules) — `packages/sdk-go`'s Module 17 additions were written
  and reviewed but not compiled in this pass.
- A live end-to-end run of the STIX import, threat-match correlation, or
  SLA breach-detection logic against a real Postgres instance was not
  performed in this sandbox (no working `prisma` CLI to apply the new
  migration). Manual review of `migration.sql` against `schema.prisma`
  is the disclosed substitute; a real migration-apply-and-query pass is
  recommended before production use.
