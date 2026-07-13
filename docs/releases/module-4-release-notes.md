# Module 4 Release Notes — Vulnerability Engine

Full decision record: `docs/adr/0004-vulnerability-engine-module.md`.

## Features added

**Backend** — the Vulnerability Engine: Recon Assets → Scan Jobs → external
scanners → normalized, deduplicated Findings → auto-attached Evidence →
Activity Timeline → events reserved for a future AI hook:

- 5 scanners at launch — Nuclei, ffuf, dirsearch, feroxbuster, Nikto —
  behind one `ScannerRunner`/`Normalizer` abstraction (direct analog of
  Module 3's `ToolRunner`/`Normalizer`); extension points reserved (enum
  values + compatibility map, nothing implemented) for SQLMap, XSStrike,
  Dalfox, Wapiti, and OWASP ZAP.
- Job System: Scan Queue, Retry, Cancel, **Pause/Resume** (new — the
  currently running scanner always finishes before a pause takes effect),
  **Priority** (0–100, higher claimed first), Worker Heartbeat, Dead Worker
  Recovery — all sharing the existing worker OS process with Module 3's
  Recon poller rather than a second binary.
- Unified `VulnFinding` model: Title, Description, Severity (Info → Low →
  Medium → High → Critical), CVSS score + vector, CWE, OWASP Category,
  Scanner + Scanner Version, Confidence, Status, Target/Project/Workspace,
  Evidence (6 named FKs into the existing Evidence model), References,
  Tags, Created By/At, Updated At.
- Finding Status lifecycle: New → Confirmed / Duplicate / Accepted Risk /
  Fixed / False Positive, single and bulk update endpoints.
- Deduplication: Target + Path + Scanner + Vulnerability Type + Signature,
  enforced by a DB unique constraint (same pure-function + constraint
  philosophy as Module 3's dedup).
- Evidence: HTTP Request, HTTP Response, Payload, Command, and Raw Output
  auto-attach as plain-text Evidence rows (Screenshot is reserved for a
  future visual-capture scanner; no v1 scanner produces one) — no new blob
  storage integration needed for this module.
- Events: `VulnScanJob{Created,Started,Completed,Failed,Cancelled,Paused,
  Resumed}Event`, `VulnFinding{Created,Updated,Confirmed,Resolved}Event` —
  all recorded on the existing Activity Timeline via the same generic
  handler every other module already uses.
- REST API: Start/Stop/Pause/Resume/Retry Scan, Findings (filter + search +
  bulk status update), Finding Details, Evidence, Scanner History, Scan
  Templates (CRUD) — fully documented in Swagger (`@ApiTags('vuln')`).

**Frontend** — complete Vulnerability Dashboard:

- Pages: `/vuln` (dashboard: severity chart, scanner status, recent
  findings), `/vuln/jobs` + `/vuln/jobs/[jobId]` (job list/detail with
  Pause/Resume/Stop/Retry, per-scanner progress, live SSE log panel),
  `/vuln/findings` + `/vuln/findings/[findingId]` (server-filtered findings
  table with search/severity/status/scanner filters, row-selection bulk
  actions, classification/evidence/timeline detail view), `/vuln/templates`
  (Scan Templates CRUD), `/vuln/scanners` (Scanner History).
- Live Updates (React Query polling + the same manual SSE read pattern as
  Recon), Search, Filters, Bulk Actions, a `/` keyboard shortcut to focus
  search plus Escape/Ctrl+A on the findings table, Dark Mode and responsive
  layout (both inherited from the existing shell — no new theme work).
- Integrated into the existing Target detail page (new Vulnerabilities
  card, parallel to the Recon card) and Project detail page (new
  Vulnerabilities tab, alongside Scan History).

## Architectural improvements

- **Worker Heartbeat / Dead Worker Recovery** is a genuinely new pattern
  versus Module 3: orphan sweeping now keys off heartbeat staleness rather
  than claim-age alone, more accurate for scans that legitimately run much
  longer than Recon's tools typically do.
- **Pause proven as a second, gentler primitive alongside Cancel** — same
  `AbortController`-based hard-kill for Cancel/Timeout, a purely DB-polled
  "finish the current scanner, then stop" mechanism for Pause. Not needed
  by Module 3, now available as a pattern for any future job-based module.
- **Evidence model reuse validated end-to-end without new storage
  infrastructure** — six nullable named FKs into Module 2's existing
  `Evidence` model, two additive `EvidenceType` enum values
  (`PAYLOAD`/`COMMAND`), zero `Attachment`/`StorageService` involvement.
- **One shared worker process now runs two independent poll loops** —
  proof that future job-based modules can add a poller to the existing
  worker rather than each needing its own deployment unit.

## Breaking changes

None. Every addition is additive: new enums, new tables, two new
(non-breaking) `EvidenceType` values, a new module wired into the existing
`AppModule`/`WorkerModule`. No Module 1–3 endpoint, contract, or schema
column changed.

## Known limitations

- No blob-storage-backed Evidence path exists for Vuln yet — contingent on
  every v1 scanner producing only plain text. The first visual-capture
  scanner (most likely OWASP ZAP) will need to revisit this.
- The Finding Details page's "Timeline" is built from the finding's own
  timestamps (first/last seen, created/updated), not a proper "Activity
  filtered by this entity" view — the Activity module doesn't expose an
  `entityId` filter yet.
- Scanner History / Dashboard summary are computed on read (aggregation
  queries over `VulnScanJobToolRun`/`VulnFinding`), not maintained as
  running counters — acceptable at current data volumes, revisit if this
  becomes a hot path.
- SQLMap, XSStrike, Dalfox, Wapiti, and OWASP ZAP are enum-and-compatibility-
  map placeholders only — no adapter code exists for any of them.
- Full `pnpm build`/`lint`/`check-types`/`test` verification for this
  module was run by the project owner outside this environment (the
  sandbox this work was authored in cannot fetch Prisma engine binaries or
  reliably run a full Next.js typecheck) — see the ADR's Consequences
  section and the commit history for the verification pass.

## Recommended next module

**AI Assistant (Module 5)**, per the existing rollout order in
`PROJECT_SPEC.md` — the first module with real events to summarize
(`VulnFindingCreatedEvent`, `VulnScanJobCompletedEvent`, and Module 3's
equivalents) rather than a cold start. Per explicit instruction, work stops
here pending approval to proceed.
