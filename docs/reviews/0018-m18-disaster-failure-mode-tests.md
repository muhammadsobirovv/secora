# Module 18 — Disaster / Failure-Mode Tests

Task #529 (Phase 27). Where Phase 25 hardened security-critical
*correctness* paths, this phase targets the two crash-recovery poller
loops that are this codebase's actual answer to "what happens when a
worker process dies mid-job" — the scenario every one of Module 18's
prior phases assumed would be handled correctly (Phase 8's job-queue
hardening, Phase 15's SSE cleanup, this module's repeated "idempotent-
by-contract" framing) but that had no test proving it.

## What was tested

**`WorkerReaperService`** (`modules/distributed-jobs/services/worker-reaper.service.spec.ts`,
new) — the Distributed Jobs system's dead-worker detection and job
migration. Five cases: stale-heartbeat detection marks a worker
`UNHEALTHY` while a fresh one is left alone; nothing is touched when no
worker is stale; an `UNHEALTHY` worker's `ASSIGNED`/`RUNNING` jobs are
migrated back to `QUEUED` via the atomic `UPDATE ... RETURNING` (not a
read-then-write pair — this is the specific fix task #510 made for a
disclosed TOCTOU race), with a `MIGRATED` `JobEvent` per job and
`currentLoad` reset; the same atomic query returning zero rows (the race
it guards against actually happening) results in no event and no
`currentLoad` reset; and the poll loop survives a thrown error on one
tick and keeps ticking rather than dying silently.

**`ReconJobPollerService`'s `sweepOrphans()`** (`modules/recon/execution/recon-job-poller.service.spec.ts`,
new) — the Recon Engine's equivalent crash-recovery path, predating and
structurally mirroring the Distributed Jobs one. Four cases: an orphaned
job under its retry budget gets a scheduled retry with real, strictly-
future backoff (not immediate re-eligibility — the exact regression
task #510 also fixed here, for a target that reliably crashes its
scanner); a job that has exhausted its retry budget is marked `FAILED`
instead; a job this same process still has genuinely in flight (tracked
in the poller's own `running` map) is correctly skipped even if
`findOrphaned`'s time-based cutoff would otherwise also match it; and
the same poll-loop error-resilience property as above.

## Why these two and not others

Both are the two places in this codebase where "a process died while
holding work" has a dedicated recovery mechanism with previously-
undisclosed, previously-untested logic (as opposed to, say, an HTTP
request simply timing out and returning an error, which is already
covered by the ordinary request-handling test suite). `VulnScanJobPollerService`
almost certainly has the same shape (Module 4's execution engine mirrors
Recon's), but was not independently re-verified this phase — noted here
rather than silently assumed identical; a future pass following this
same file's pattern would be the natural next step if that surface's
crash-recovery behavior needs its own regression coverage.

## Environment constraint

Same as every other test-writing phase this module: `mcp__workspace__bash`
is denied this session, so neither new spec file could actually be
executed here. Both were traced field-for-field against the real
`WorkerReaperService`/`ReconJobPollerService`/`ReconJobsRepository`
source (including fixing one real mock-sequencing bug found during
self-review — an early draft of the "still running, not really orphaned"
test had `findOrphaned` return the job on every call, which would have
made it register as an orphan before the job was even claimed) before
being left for Phase 30's verification attempt or a real CI run.
