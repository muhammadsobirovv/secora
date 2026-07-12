# 0003: Recon Engine module (Module 3)

Status: Accepted
Date: 2026-07-12

## Context

Module 3 adds automated reconnaissance: run external security tools (subdomain
enumeration, crawling, port scanning, fingerprinting, WHOIS/ASN lookups, ...)
against a Target, normalize their output into a common schema, deduplicate it,
and surface it as Findings — while automatically generating Evidence and
Activity Timeline entries, and leaving explicit seams for AI Summary, Report
Generation, Bug Bounty workflow, and Notifications to hook in later without
this module knowing they exist.

The scope was fixed by the project owner up front: Module 3 only. No AI
Assistant, Report Generator, Bug Bounty Workspace, browser extension, desktop
app, or mobile app work. Everything below documents what was already built
for this module (mostly during earlier WSL-based development) and what this
round of work added on top of it.

## Decision

### 1. Job/worker architecture: controllers enqueue, a separate process executes

`ReconJobsController` / `TargetReconJobsController` / `ProjectReconJobsController`
only ever create a `ReconJob` row (status `PENDING`) and its per-tool
`ReconJobToolRun` rows, and return immediately. Nothing about running a tool
happens on the HTTP request path.

Execution is owned by `ReconJobPollerService`, which runs inside a **separate
OS process** bootstrapped via `worker.main.ts` → `NestFactory.createApplicationContext(WorkerModule)`
— not inside the main HTTP process (`AppModule`). `WorkerModule` is its own
root module: it imports `ConfigModule`/`ClsModule`/`PrismaModule`/`ProvidersModule`
directly (mirroring `AppModule`'s infrastructure wiring, since it's a genuinely
separate DI container) but omits everything HTTP-only (guards, filters,
interceptors, `AuthModule`, `RbacModule`, `ApiKeysModule`, ...).

This separation exists so recon workers can be scaled and deployed
independently of the API — multiple worker processes, on multiple hosts, can
run against the same database.

Job states: `PENDING → RUNNING → (COMPLETED | FAILED | CANCELLED)`, with
`RETRYING` as an intermediate state on the way back to `RUNNING`. Per-tool
`ReconJobToolRun` rows carry the same status enum independently, so a job's
progress is visible tool-by-tool while it's running.

### 2. Distributed-worker-safe job claiming

`ReconJobPollerService` runs a recursive `setTimeout` loop (not `setInterval`,
so a slow tick can't pile up overlapping runs) that on every tick: checks for
cancellation requests on jobs it's running, sweeps orphaned jobs (claimed by a
worker that died mid-run, detected via a claim-age cutoff), and claims new
work up to `RECON_WORKER_CONCURRENCY` slots.

Claiming is atomic at the database level via `jobsRepository.claimNext(claimantId)`,
where `claimantId = "<hostname>:<pid>:<uuid>"` uniquely identifies this worker
process instance. Two worker processes racing to claim the same job cannot
both win — the claim is a single conditional UPDATE. This is what makes the
architecture safe to run as N worker replicas rather than exactly one.

Orphan sweeping: if a job has been claimed longer than
`timeoutSeconds + RECON_WORKER_ORPHAN_SWEEP_INTERVAL_MS` and isn't in *this*
process's local `running` map, its claiming worker is presumed dead. The job
is routed through the same retry/fail budget (`retryCount` vs `maxRetries`)
as any other execution failure — no bespoke recovery path.

### 3. Timeout and cancellation share one mechanism

Each claimed job gets an `AbortController`. A `setTimeout(job.timeoutSeconds)`
calls `.abort()` on timeout; the poller's cancellation check calls the same
`.abort()` when it notices `cancelRequestedAt` on a job it's running. The
`AbortSignal` is threaded through to the running `ToolRunner`, which passes it
to the spawned child process so the OS process actually gets killed — not just
"stops being awaited."

### 4. Tool integration: one interface, one registry, additive extension

```
ToolRunner.run(ctx): Promise<ToolRunResult>       // spawns the CLI tool, returns raw stdout
Normalizer.normalize(rawOutput, ctx?): ReconFindingInput[]   // parses raw output into typed findings
```

`ToolRunnerRegistry` resolves both by `ReconTool` enum value. Adding a new
tool is a closed, three-step recipe that never touches existing tool code:

1. A `ToolRunner` class (`tool-runners/adapters/<tool>.tool-runner.ts`) —
   declares `readonly tool` and `readonly supportedTargetTypes`, spawns the
   CLI via `ToolProcessSpawner` with an **argv array** (never a shell string,
   to avoid injection), forwards `onLog` for live output.
2. A `Normalizer` class (`tool-runners/normalizers/<tool>.normalizer.ts`) —
   pure function from raw stdout to `ReconFindingInput[]`.
3. One entry each in `ToolRunnerRegistry`'s `runners`/`normalizers` maps and
   `ReconCoreModule`'s providers, plus the tool's target-type compatibility in
   `packages/shared/src/recon.ts`'s `TOOL_TARGET_TYPE_COMPATIBILITY`.

This pattern was proven six more times in this round of work — Amass, Katana,
Gau, Waybackurls, WHOIS, and ASN lookup were all added this way alongside the
pre-existing Nmap, Subfinder, HTTPX, DNSx, Naabu, WhatWeb, Assetfinder, and
Gowitness, without modifying any of the earlier eight.

WHOIS and ASN reuse the same `whois` CLI binary (ASN via Team Cymru's
`whois -h whois.cymru.com`) rather than introducing a new dependency for two
closely related lookups.

### 5. Normalized finding schema: one polymorphic model, not one table per tool

Every tool's output — regardless of shape — normalizes into the same
`ReconFinding` row: `type` (enum: `SUBDOMAIN`, `URL`, `OPEN_PORT`, `SERVICE`,
`TECHNOLOGY`, `DNS_RECORD`, `HTTP_HEADER`, `CERTIFICATE`, `SCREENSHOT`,
`SECURITY_HEADER`, `WHOIS_RECORD`, `ASN`) + `value` (string) + `data` (JSON,
type-specific payload) + `source` (which `ReconTool` produced it) + `dedupKey`.

This is the "common schema" the spec asked for: findings from twelve
different tools live in one table, are queried with one API, and are rendered
with one findings table component — new finding types are additive (new enum
value + new `dedupKey` function), never a schema migration for structural
change.

### 6. Deduplication: pure key functions + a DB unique constraint

Each finding type has a small pure function in `dedup-key.util.ts`
(`subdomainDedupKey`, `whoisRecordDedupKey`, `asnDedupKey`, ...) that computes
a stable, normalized key from the finding's identity fields. `ReconFinding`
has a unique constraint on `(targetId, type, dedupKey)`, and
`findingsRepository.upsertMany()` upserts on that constraint. Deduplication is
therefore not application-level logic that can drift from the schema — it's
enforced by Postgres, with the key-computation functions as the only thing
that can go wrong (and the only thing under unit test).

### 7. Evidence and Activity Timeline are automatic, not opt-in

Every tool run that isn't `GOWITNESS` (which produces its own screenshot
Evidence) generates one `Evidence(type: LOG)` row per run holding the raw
tool output, inside the same transaction as the finding upserts
(`persistToolResult`, `@Transactional()`). This is the audit trail: a job's
findings can always be traced back to the exact raw output they came from.

Domain events (`ReconJobCreatedEvent`, `ReconJobStartedEvent`,
`ReconJobCompletedEvent`, `ReconJobFailedEvent`, `ReconJobCancelledEvent`,
`ReconFindingPromotedEvent`) are published via `@nestjs/cqrs`'s `EventBus` and
picked up by the single generic `ActivityRecordingHandler` that already
records every other module's events — Module 3 didn't need to know that
handler, its repository, or the `ActivityEvent` table exist; it only needed
its events to implement `ActivityDomainEvent`.

One consequence of the worker running in a separate OS process: `EventBus`
doesn't cross process boundaries, so `WorkerModule` imports `ActivityModule`
directly and runs a second instance of `ActivityRecordingHandler` inside the
worker process. Both the API process and the worker process write to the same
`ActivityEvent` table; there's no cross-process event bus.

### 8. Live progress: SSE for logs, polling for job/list state

`GET /recon/jobs/:jobId/logs/stream` is a NestJS `@Sse()` endpoint that polls
the `ReconJobLog` table (`sinceSeq` cursor) and pushes new rows as
server-sent events, completing the stream once the job reaches a terminal
status. The frontend can't use the browser's native `EventSource` here
because the endpoint requires a custom `Authorization: Bearer` header, which
`EventSource` cannot send — instead, `useReconJobLogs` does a manual
`fetch()` + `ReadableStream` read loop, parsing `data:` frames itself.

Job list/detail state uses React Query polling instead of SSE:
`useReconJob(id)` polls every 3s only while the job's status is non-terminal
(function-form `refetchInterval` that reads `query.state.data.status`, so a
finished job's query goes idle automatically); `useRecentReconJobs()` polls
unconditionally at the same interval for the workspace-wide dashboard.

### 9. Future extension points — hooks only, nothing implemented

- **AI Summary**: `ReconJobCompletedEvent` is published with `findingsCount`
  and `toolsRun` metadata specifically so a future AI module can subscribe
  and generate a summary. No AI logic exists in this module; the event is
  published, never consumed, here.
- **Report Generation** / **Bug Bounty workflow** / **Notifications**: none of
  these are implemented. `ReconFindingPromotedEvent` (a finding promoted to a
  first-class `Target`) and the Evidence/Activity trail this module already
  produces are the seams a future module would build on — no code in this
  module references them.

### 10. Frontend integration points

Rather than only a generic `/recon` landing page, Recon integrates at the two
points the backend's own code comments anticipated:

- A **Recon card** on the target detail page (`/targets/[targetId]`) — job
  list scoped to that target, plus "New scan."
- A **Scan History tab** on the project detail page (`/projects/[projectId]`)
  — job list scoped to that project, joining the existing Targets/Notes/
  Evidence/Activity tabs.
- `/recon` — workspace-wide "Recent scans" (last 10, across every project).
- `/recon/jobs/[jobId]` — job detail: per-tool Progress, live SSE Log panel,
  and a filterable Findings table with a "Promote to Target" action for
  finding types that map to a `TargetType` (`SUBDOMAIN`, `URL` — see
  `FINDING_TYPE_TO_TARGET_TYPE` in `packages/shared/src/recon.ts`).

## Consequences

- Adding tool #13 touches exactly three new files plus three additive lines
  of registration — no existing tool's code is at risk.
- Running N worker replicas is a deployment decision, not a code change; the
  atomic claim and orphan sweep already handle it.
- The `ReconFinding` polymorphic model means new finding *types* don't need a
  migration, but querying/aggregating by structured fields *within* `data`
  (e.g. "all open ports on 443") requires JSON queries rather than typed SQL
  columns — acceptable for a findings table, would need revisiting if
  Module 3 grows heavy analytical queries later.
- The worker process duplicating `ActivityModule` (and therefore
  `ActivityRecordingHandler`) is the direct cost of `EventBus` not crossing
  process boundaries; if a future module needs true cross-process event
  delivery, that's a different mechanism (e.g. a message queue) than what
  exists today.
- SSE logs are polling-backed (DB cursor), not a push from the tool process
  itself — acceptable latency for human-watched log tails, not intended as a
  low-latency event bus.

## Tool inventory (as of this ADR)

| Tool | Finding type(s) produced | Target types |
|---|---|---|
| Subfinder | SUBDOMAIN | DOMAIN |
| Amass | SUBDOMAIN | DOMAIN |
| Assetfinder | SUBDOMAIN | DOMAIN |
| HTTPX | URL, HTTP_HEADER, TECHNOLOGY | URL, DOMAIN, SUBDOMAIN |
| Katana | URL | URL, DOMAIN, SUBDOMAIN |
| Gau | URL | DOMAIN, SUBDOMAIN |
| Waybackurls | URL | DOMAIN, SUBDOMAIN |
| DNSx | DNS_RECORD | DOMAIN, SUBDOMAIN |
| Naabu | OPEN_PORT | IP_ADDRESS, CIDR, DOMAIN, SUBDOMAIN |
| Nmap | OPEN_PORT, SERVICE | IP_ADDRESS, CIDR, DOMAIN, SUBDOMAIN |
| WhatWeb | TECHNOLOGY | URL, DOMAIN, SUBDOMAIN |
| Gowitness | SCREENSHOT | URL, DOMAIN, SUBDOMAIN |
| WHOIS | WHOIS_RECORD | DOMAIN |
| ASN lookup | ASN | IP_ADDRESS |
