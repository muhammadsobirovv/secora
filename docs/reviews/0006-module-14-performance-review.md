# Module 14 Performance Review

Follow-up to `0004-final-performance-review.md`, scoped to what Module 14 added: response compression/caching (API Gateway), the Admin Console's `ClusterOverviewService` aggregation endpoint, the new Plugin Marketplace "check for updates" query, and the `WorkerNode.version` field. Same posture as the prior review: static analysis only, no load testing (this sandbox has never had a running instance of the application to load-test against).

## 1. Response compression (`bootstrap.ts`)

Adds a `gzip`/`deflate`/`brotli` middleware pass over every non-SSE response. This is a CPU/latency trade favoring bandwidth — correct default for a typical deployment, but it does add CPU cost on every request that wasn't there before. The SSE exclusion (`text/event-stream` check before `compression`'s own default filter) is the one correctness-critical detail; verified present and structured to fail safe (skips compression, never the reverse) even if a future dependency bump changes `compressible`'s classification of that MIME type.

**No finding requiring action** — this is a standard, low-risk addition. A deployment that's CPU-bound rather than bandwidth-bound (e.g., behind a CDN or LAN-only reverse proxy that would otherwise compress once at the edge) can disable it by removing the middleware call; no config flag was added to toggle it at runtime, since no other module offers per-middleware runtime toggles either — consistent with this codebase's existing pattern of code-level rather than config-level middleware composition.

## 2. Response caching (`CacheResponseInterceptor`)

Opt-in per-route, backed by the existing `CACHE_SERVICE` abstraction (Module 14's own memory/Redis/disk providers). The one real consumer (`KnowledgeBaseReferencesController`'s `list`/`get`) is exactly the shape that benefits: curated, read-heavy, rarely-changing content. **No finding** — correctly scoped, and the class doc comment already discloses the one real risk (cross-user cache-key isolation) and the one real limitation (no invalidation on write, TTL-bounded staleness instead).

## 3. `GetAvailablePluginUpdatesQuery` — N+1 fixed during this pass

Originally written as one `pluginVersion.findFirst` per installed plugin (N+1: an org with 50 installed plugins would issue 51 queries for one API call). Rewritten to two queries total — fetch all installations, then fetch every non-deprecated version for the distinct set of installed `pluginId`s in one `findMany`, reducing to "latest per plugin" in memory. Added a supporting index (`@@index([pluginId, publishedAt])` on `PluginVersion`) so the ordered-per-plugin lookup doesn't require a full sort at read time. This is the one genuine finding-and-fix this review produced; see `apps/api/src/modules/plugins/queries/plugin-installations.query.ts` for the current form.

## 4. `ClusterOverviewService.getOverview()` — fan-out, not a loop, acceptable

Runs a large `Promise.all` across ~10 independent data sources (queue stats, cache stats, DB `groupBy`s, storage probe, etc.) rather than a query-per-item loop — the right shape for this kind of aggregation endpoint. Two real costs worth flagging for a deployment with a large `WorkerNode`/`DistributedJob` table: the `groupBy` calls have no explicit time-bound filter (they aggregate across *all* rows, not "last 24h" except where the code says so), so this endpoint's cost grows with total historical row count, not active/recent row count. This was true before Module 14 too (it's Module 14's own service, added in task #314, not a regression this pass introduced) — flagging it here as a genuine, not-yet-addressed scaling concern for the Admin Console: a deployment with millions of historical `DistributedJob` rows should expect this endpoint to slow down over time unless a retention/archival policy is added for that table (no such policy exists yet anywhere in this codebase for `DistributedJob`/`JobEvent`).

**Recommendation, not implemented this pass** (would require a new retention-policy feature, out of scope for a performance review): add a scheduled cleanup job for terminal-state `DistributedJob` rows older than a configurable window, mirroring the pattern Module 14's own backup-retention logic already uses for backup artifacts.

## 5. `WorkerNode.version` — no cost added

A nullable string column on an existing table, written on register/heartbeat (both already-existing write paths, not new query volume) and read only via the same `findMany`/`update` calls that already existed. No index added (not filtered/sorted on) and none needed.

## Summary

One real fix made (Plugin Marketplace N+1 → 2 queries + supporting index). One pre-existing, not-newly-introduced scaling concern flagged for future work (`ClusterOverviewService`'s unbounded historical aggregation). Everything else added this module is either negligible-cost (compression, version fields) or already correctly scoped (opt-in caching). Consistent with the prior review's headline: nothing pathological, nothing rigorously load-tested — this remains a static read, not a benchmark result.
