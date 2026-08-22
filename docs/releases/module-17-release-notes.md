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
- A full-program `tsc --noEmit` typecheck of `apps/api` was not
  completed in this sandbox (consistent with prior modules' findings —
  the check times out before completing on a codebase this size).
- The Go toolchain remains absent from this sandbox (consistent with
  prior modules) — `packages/sdk-go`'s Module 17 additions were written
  and reviewed but not compiled in this pass.
- A live end-to-end run of the STIX import, threat-match correlation, or
  SLA breach-detection logic against a real Postgres instance was not
  performed in this sandbox (no working `prisma` CLI to apply the new
  migration). Manual review of `migration.sql` against `schema.prisma`
  is the disclosed substitute; a real migration-apply-and-query pass is
  recommended before production use.
