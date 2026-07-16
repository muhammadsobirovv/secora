# Module 6 Release Notes — Bug Bounty Workspace

Full decision record: `docs/adr/0006-bug-bounty-workspace-module.md`.

## Features added

**Backend** — the full bug-bounty-hunter workflow, layered read-through/
write-through on top of Modules 2-5 rather than duplicating their storage:

- **Programs**: CRUD, platform (HackerOne/Bugcrowd/Intigriti/YesWeHack/
  Synack/Internal/Private/Custom), status, rules/severity-matrix/disclosure
  policy as free-form JSON/Markdown, tags.
- **Scope Manager**: scope items (Domain/Wildcard/URL/API/Mobile App/CIDR/
  IP Range/ASN/Cloud Asset), auto-classification of any value or linked
  Target against a program's scope rules (`IN_SCOPE`/`OUT_OF_SCOPE`/
  `UNKNOWN`, OUT_OF_SCOPE always wins over a broader IN_SCOPE match),
  IPv4 CIDR/range matching implemented from scratch (IPv6 not supported —
  documented limitation).
- **Program Importer**: HackerOne, Bugcrowd, Intigriti, Markdown, and JSON
  adapters behind one registry, normalizing a pasted platform export into a
  program + scope items in one request.
- **Asset Inventory**: targets aggregated at read time with Recon findings
  (technology/DNS/open ports/services/TLS), Vuln findings (count, critical
  count, risk score), Notes, Evidence (incl. screenshot count), and scope
  classification — no new storage, always fresh.
- **Finding Lifecycle**: `NEW → TRIAGED → VERIFIED → REPORTED → RESOLVED →
  CLOSED → ARCHIVED`, with `DUPLICATE`/`NEED_MORE_INFO` side-branches;
  `CLOSED`/`ARCHIVED` are terminal.
- **Bug Report Generator**: one persisted report rendered into five
  platform-shaped templates (HackerOne/Bugcrowd/Intigriti/Markdown/HTML);
  export to PDF (via HTML)/Markdown/HTML/JSON/CSV.
- **Report Draft Assistant**: AI-generated executive summary, technical
  details, impact, risk, remediation, and references from a finding's data,
  reusing Module 5's provider/prompt-builder seam.
- **Duplicate Detection**: lexical (title Jaccard + exact field matches) and
  semantic (pgvector cosine similarity via Module 5's `AiMemoryService`)
  scoring, combined by `max()`, threshold-filtered, top 10 results.
- **Payload Library**: seed payloads (workspace-visible, not editable) plus
  per-workspace custom entries across 16 categories (XSS/SQLi/SSRF/SSTI/
  XXE/IDOR/CSRF/LFI/RFI/RCE/Deserialization/JWT/GraphQL/CSP/CORS/Open
  Redirect), AI "explain this payload."
- **Personal Knowledge Base**: Markdown notes with an optional checklist,
  linkable to a project/target/finding/report.
- **Bookmarks**: save a target/finding/report/payload/note for quick access
  (polymorphic loose reference, no DB FK).
- **Dashboard + Statistics**: active programs, in-scope assets, pending
  reports, total bounty earned, recent findings, recent activity, success/
  acceptance/duplicate rates, average severity, average time-to-triage/
  resolve, monthly earnings, per-platform comparison.
- **Calendar**: submission deadlines, follow-ups, retests, disclosures.
- **Notifications**: deadline reminders (self-scheduling background poller,
  configurable lookahead/poll interval), program updates, AI recommendations
  — mark read / mark all read.
- **Global Search**: fans out across programs, findings, reports, payloads,
  and knowledge base notes.
- **Events**: `ProgramCreated`, `ProgramUpdated`, `FindingReported`,
  `ReportSubmitted`, `ReportAccepted`, `ReportRejected`, `BountyAwarded`,
  `ReportClosed` — all recorded on the existing Activity Timeline via the
  same generic handler every other module already uses.
- **REST API**: 11 controllers, ~50 endpoints, Swagger-documented, under
  `/bugbounty/*`.

**Security**: workspace isolation + enumeration-safe 404s on every read
(same pattern as every prior module), soft deletes on Program/Finding/
Report/PayloadLibraryEntry/KnowledgeBaseNote, **optimistic locking on
BugReport** (new to this codebase — `version`-guarded updates, 409 on
conflict), rate limiting on AI-backed routes (program import, report draft
generation, payload explain — 20 req/min), full class-validator DTO
coverage.

**Frontend** — 11 pages under `/bugbounty`: Dashboard, Programs (list +
detail with scope manager/target linking/classify tool), Asset Inventory,
Findings (list + detail with stage transitions/duplicate check/create-report),
Reports (list + detail with AI draft/preview/export/submit, version-aware
save), Payload Library, Knowledge Base, Bookmarks, Calendar, Notifications,
Search. "Bug Bounty" promoted from the sidebar's "coming soon" section to a
real nav entry.

## Bugs found and fixed

1. Asset Inventory accepted an unvalidated `projectId` filter, leaking
   targets across workspaces — fixed by validating it through
   `projectsRepository.findByIdForWorkspace()`.
2. `severity` fields in the shared DTOs were typed as plain `string` instead
   of `VulnFindingSeverity` — fixed by importing the real union type.
3. `BugReport` had no `triagedAt` column, leaving
   `averageTimeToTriagedHours` with no source data — added the column,
   threaded it through the repository/mapper/DTO/handler.
4. **Data leak**: `PrismaPayloadLibraryRepository.list()`'s duplicate `OR:`
   object keys silently dropped the workspace-visibility filter whenever a
   search term was supplied, returning every workspace's custom payloads —
   fixed by restructuring into an `AND: [{OR: [visibility]}, {OR: [search]}]`
   shape.
5. **IDOR**: `markRead(id)` had no ownership check, letting any
   authenticated user mark any other user's notification as read — fixed by
   requiring `userId` and scoping the update by both `id` and `userId`.
6. `AiMemorySourceType`'s hand-maintained shared TS union was missing the
   three Module 6 source types the Prisma schema already had — fixed by
   syncing them.

## Known limitations

- Asset Inventory's per-request join has no caching layer; large workspaces
  (hundreds of targets, thousands of findings per program) would benefit
  from a materialized view — not built here, flagged as a follow-up.
- Statistics reads at most a workspace's most recent 1000 reports/findings
  per repository `list()` call rather than a SQL aggregate.
- IPv6 CIDR/range scope matching is not implemented.
- PDF export has no dedicated server-side renderer; it returns the report's
  HTML content with `mimeType: "text/html"` for the client to convert.

## Testing

Unit tests added for the highest-value pure logic and handler behavior:
scope classification (`classify-scope-value.util.spec.ts`), duplicate
lexical scoring (`duplicate-lexical-score.util.spec.ts`), finding
stage-transition guards including the terminal-stage and DUPLICATE-requires-
duplicateOfId rules (`bugbounty-finding-lifecycle.commands.spec.ts`), bug
report optimistic locking and status-transition event publishing
(`bug-report-lifecycle.commands.spec.ts`), and all five report template
renderers including HTML-escaping of user content
(`bug-report-template-renderer.spec.ts`).

Build/lint/typecheck were run against the whole `apps/web` package in-session
(clean). `apps/api`'s full project typecheck and the Jest suite could not be
run to completion in this sandbox — the sandbox has no network access to
Prisma's binary CDN (so `prisma generate` can't run) and `apps/api`'s
project-wide `tsc` run exceeds the sandbox's 45s per-command budget; the
pre-existing `ts-jest`/Jest version mismatch that blocks all Jest execution
in this sandbox (confirmed against an existing, unrelated Module 4 spec —
not something this module's changes caused) is unresolved here. **Run
`pnpm build && pnpm lint && pnpm check-types && pnpm test` from the repo root
before merging** — see the Completion Rule in the Module 6 task list.
