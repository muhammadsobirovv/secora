# 0006: Bug Bounty Workspace module (Module 6)

## Context

The spec's original placeholders — "Bug Bounty Workspace" (targets, scope
tracking, findings) and "Report Generator" — are merged into one module here,
the same way Module 4 absorbed and redefined the old "Vulnerability Tools"
placeholder. Module 6 is the first module whose job is not to *discover* data
(Recon, Vulnerability Engine) but to organize and act on data that already
exists across Modules 2-5: Targets, VulnFindings, ReconFindings, Notes,
Evidence, and the AI Security Copilot's memory/provider/prompt seams. Its
purpose is the full bug-bounty-hunter workflow — track programs and their
scope, promote a vulnerability into a trackable Finding, write it up as a
Report against a specific platform's template, get AI help drafting it, catch
duplicates before submitting, and follow it through to a paid bounty.

Constraints carried over unchanged from every prior module: workspace
isolation and enumeration-safe 404s on every read, CQRS with
`@CommandHandler`/`@QueryHandler`, domain events consumed by the existing
generic `ActivityRecordingHandler` (no new audit-log system), soft deletes on
user-authored data, a `core module + HTTP module` split, and "don't touch
Modules 1-5 except bug fixes."

## Decision

### 1. No new discovery pipeline — Module 6 is a read-through/write-through layer over Modules 2-5

Unlike Recon/Vuln, there is no `BugBountyAsset` table and no new background
worker for scanning. **Asset Inventory** is computed at read time by joining
`Target` (Module 2) with `ReconFinding`/`VulnFinding` (Modules 3/4) and
`Note`/`Evidence` (Module 2) for whichever targets are linked to a program —
always as fresh as its source module, never a stale copy, at the cost of
being O(targets × findings) per request (acceptable at bug-bounty-program
scale; documented as a follow-up if a workspace ever needs it precomputed).
**Duplicate Detection** and the **Report Draft Assistant** reuse Module 5's
`AiMemoryService` (pgvector RAG) and `AiProviderRegistryService`/
`AiPromptBuilderService` rather than building a second AI seam — the only
change needed there was adding `'BUGBOUNTY_FINDING' | 'BUG_REPORT' |
'PAYLOAD_LIBRARY_ENTRY'` to `AiMemorySourceType`.

### 2. Genuinely new storage: Program, Scope, Finding, Report, Payload Library, Knowledge Base, Bookmarks, Calendar, Notifications

These have no Module 2-5 analog, so they get real tables:
`BugBountyProgram` (+ `BugBountyProgramScopeItem`, `BugBountyProgramTarget`
join table — a join table because a Target can be linked to more than one
program's scope, e.g. a shared staging environment), `BugBountyFinding`,
`BugReport`, `PayloadLibraryEntry` (seed rows have `workspaceId: null` and are
visible workspace-wide; custom rows are `workspaceId`-owned), `KnowledgeBaseNote`,
`Bookmark` (a "loose reference" — `entityType`/`entityId` with no DB foreign
key, the same pattern `BugBountyNotification.relatedEntityType/relatedEntityId`
uses, because a bookmark or notification can point at five different entity
types and a polymorphic FK isn't worth the schema complexity), `BugBountyCalendarEvent`.

### 3. Finding Lifecycle is a forward-moving stage machine, not a free-form status field

`NEW → TRIAGED → VERIFIED → REPORTED → RESOLVED → CLOSED → ARCHIVED`, with
`DUPLICATE` and `NEED_MORE_INFO` as side-branches reachable from any active
stage. `CLOSED`/`ARCHIVED` are terminal — the handler rejects any further
transition once a finding reaches either, and transitioning to `DUPLICATE`
requires `duplicateOfId`. This mirrors the spirit of Vuln's Finding Status
lifecycle (Module 4 ADR §6) but as an explicit ordered stage list rather than
an unordered enum, since the spec calls for stepper-style UI rendering.

### 4. Bug Report Generator: one persisted report, five rendered views

A `BugReport` row holds the canonical content (summary, steps, PoC, impact,
CWE, CVSS, references, mitigation). `renderBugReportTemplate()` is a pure
function dispatching on `BugReportTemplate` (HackerOne/Bugcrowd/Intigriti/
Markdown/HTML) that reshapes that same content into each platform's field
grouping — HackerOne merges steps+PoC into one "Description" field the way
its own submission form does, Bugcrowd keeps them separate, Intigriti leads
with CVSS. PDF has no dedicated layout; it reuses the Markdown renderer and
the *export* layer (a separate concern from template rendering) hands that
Markdown to a client-side PDF conversion, since there's no server-side PDF
renderer in this API — `ExportBugReportResultDto.mimeType` is the
authoritative signal for what `content` actually contains, not the requested
`format`.

### 5. Optimistic locking, introduced for the first time in this codebase, on `BugReport.version`

No prior module had a resource with meaningfully concurrent multi-field edits
by potentially more than one person (Targets/Notes/Evidence are edited by one
person at a time in practice; VulnFinding's only mutable field is `status`).
A `BugReport` accumulates edits from the Report Draft Assistant, manual
editing, and status transitions, so `UpdateBugReportCommand` requires an
`expectedVersion`; the repository's `updateMany({ where: { id, version:
expectedVersion }, data: { version: { increment: 1 } } })` returning 0 rows
throws `BugReportVersionConflictError`, translated to `BUG_REPORT_VERSION_CONFLICT`
(409) at the command-handler boundary via an `updateWithVersionGuard()`
helper. This is the one piece of Module 6 that's a genuine first for the
codebase rather than a pattern reuse.

### 6. Duplicate Detection: lexical scorer + semantic search, combined by max()

`scoreLexicalMatch()` is a from-scratch Jaccard-token title similarity
(weight 0.4) plus exact target/endpoint/payload/vulnType matches (0.2/0.2/
0.1/0.1), capped at 1.0. It's combined with `AiMemoryService.search(...,
{ sourceType: 'BUGBOUNTY_FINDING' })`'s cosine-similarity results via
`Math.max()` per candidate — a finding with a strong lexical match but weak
semantic similarity (or vice versa) still surfaces, rather than requiring
both signals to agree. `BUGBOUNTY_DUPLICATE_SIMILARITY_THRESHOLD` (env,
default 0.5) filters the combined score; top 10 results returned.

### 7. Scope classification: IPv4-only CIDR/range matching, from scratch

`classifyScopeValue()` matches a value against `DOMAIN`/`WILDCARD`/`URL`/
`API`/`MOBILE_APP`/`CLOUD_ASSET`/`ASN`/`CIDR`/`IP_RANGE` scope rule types.
OUT_OF_SCOPE rules always win over IN_SCOPE ones regardless of declaration
order (the standard bug-bounty convention: a narrower out-of-scope carve-out
overrides a broader in-scope wildcard, e.g. `*.example.com` in scope with
`internal.example.com` explicitly out). IPv6 CIDR/range matching is not
implemented — a known, documented limitation; IPv4 covers the overwhelming
majority of real bug-bounty scope entries, and this reuses the exact
IPv4-integer-arithmetic approach rather than pulling in a dependency for it.

### 8. Program Importer: one interface, one registry, additive extension — the same pattern as Recon's ToolRunner and Vuln's ScannerRunner

Five adapters (HackerOne, Bugcrowd, Intigriti, Markdown, JSON) behind
`ProgramImporterRegistryService`, each normalizing a platform-specific export
format into `{ program, scopeItems, warnings }`. Adding a sixth platform
means adding one adapter class to the registry, not touching the import
command handler.

### 9. Background work: a third self-scheduling poller in the shared worker process

`BugBountyDeadlineNotifierService` follows the exact `setTimeout`-loop shape
Recon's `ReconJobPollerService` and Vuln's `VulnScanJobPollerService` use
(this codebase doesn't use `@nestjs/schedule` anywhere) — it polls
`BugBountyCalendarEvent` rows due within `BUGBOUNTY_DEADLINE_LOOKAHEAD_HOURS`
(default 48h) every `BUGBOUNTY_DEADLINE_POLL_INTERVAL_MS` (default 5m),
creates a `REPORT_DEADLINE`/`REMINDER` notification, and marks the event
notified. Unlike Recon/Vuln's pollers, there's no job-claiming — this is
pure read-due-events → write-notification, safe to run redundantly across
multiple API instances since `markNotified()` is the dedupe guard (a
narrow race between two instances reading before either writes is
acceptable for a non-critical reminder, unlike the job-claiming Recon/Vuln
do for actual scan work). It's registered in `worker.module.ts` alongside
the other two pollers and started from `worker.main.ts` — Module 6 doesn't
introduce a fourth worker binary any more than Module 4 introduced a second
one.

### 10. Events: the 8 named events, auto-recorded with zero new wiring

`ProgramCreated`, `ProgramUpdated`, `FindingReported`, `ReportSubmitted`,
`ReportAccepted`, `ReportRejected`, `BountyAwarded`, `ReportClosed` all
implement `ActivityDomainEvent` and are published from inside the relevant
command handlers. Because `ActivityRecordingHandler` (Module 2) subscribes
generically to anything implementing that interface, none of these needed
per-module registration beyond declaring the handler classes as CQRS
providers — the same zero-wiring behavior every prior module's events got.
`BountyAwarded` is deliberately distinct from `ReportAccepted`: a report can
be accepted with no bounty (hall-of-fame-only programs), so a future
earnings-tracking integration can subscribe to `BountyAwarded` alone.

### 11. Frontend: eleven pages under `/bugbounty`, one API client, one hooks module

Following the `lib/api/<module>.ts` + `features/<module>/hooks/use-<module>.ts`
+ `app/(dashboard)/<module>/**` convention exactly (see Vuln's frontend for
the template this copies). One shared badge component file
(`bugbounty-badges.tsx`) covers finding stage / report status / program
status / scope classification; severity badges are reused directly from
Module 4's `VulnFindingSeverityBadge` since `BugBountyFindingDto.severity`
is the same `VulnFindingSeverity` union, not a duplicate type.

## Consequences

- **Positive**: Zero duplicated storage or AI infrastructure — Asset
  Inventory, Duplicate Detection, and the Report Draft Assistant all read
  through to Modules 2-5 rather than copying data, so they're always
  consistent with the source of truth and add no new sync-drift failure
  mode.
- **Positive**: Optimistic locking on `BugReport` establishes a pattern the
  codebase didn't have before, for any future module with genuinely
  concurrent multi-field edits.
- **Negative**: Asset Inventory's per-request join has no caching layer; a
  workspace with hundreds of linked targets and thousands of findings per
  program would need a materialized view or precomputed table. Flagged as a
  follow-up, not solved here (same tradeoff Module 6 Statistics accepted for
  its 1000-record repository-list cap).
- **Negative**: IPv6 scope matching is unimplemented. Flagged in the scope
  classifier's own doc comment.
- **Neutral**: RBAC remains scaffolding-only (`@Roles()`/`RolesGuard` exist
  but are unused) across this module too, consistent with every prior
  module — actual authorization is 100% enumeration-safe-404
  workspace-ownership checks via `resolveWorkspaceForCaller`/
  `resolveBugBountyProgramForCaller`/`resolveBugBountyFindingForCaller`/
  `resolveBugReportForCaller` in `authorization.util.ts`.

## Bugs found and fixed during implementation

Six real bugs were caught during development, all through careful
cross-referencing of repository interfaces and Prisma schema before writing
consuming code (no test execution was possible in the sandbox this module
was built in — Prisma's binary CDN isn't reachable there):

1. **Cross-workspace target leak** in Asset Inventory — a raw `projectId`
   query filter wasn't validated against the caller's workspace before use.
2. **Type-safety gap** — `severity` fields in the shared `bugbounty.ts` DTOs
   were `string` instead of the proper `VulnFindingSeverity` union.
3. **Missing schema data** — `BugReport` had no `triagedAt` column, so
   `averageTimeToTriagedHours` in Statistics had nothing to compute from.
4. **Data leak (real security bug)** — `PrismaPayloadLibraryRepository.list()`
   had two `OR:` keys in the same object literal (one for workspace
   visibility, one for search); the second silently overwrote the first,
   so any search request returned every workspace's custom payloads, not
   just the caller's.
5. **IDOR (real security bug)** — `BugBountyNotificationsRepository.markRead(id)`
   had no ownership check at all; any authenticated user could mark any
   other user's notification as read by guessing a UUID.
6. **AiMemorySourceType out of sync** — the Prisma schema's enum had the
   Module 6 source types but the hand-maintained shared TypeScript union
   didn't, which would have broken typecheck the instant this module's code
   used them.

See the Module 6 implementation summary (`docs/releases/module-6-release-notes.md`)
for how each was fixed.
