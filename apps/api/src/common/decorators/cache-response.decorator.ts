import { SetMetadata } from '@nestjs/common';

export const CACHE_RESPONSE_TTL_KEY = 'cacheResponseTtlSeconds';

/// Module 14 — API Gateway: opt-in response caching for a single GET
/// route/controller, backed by the `CACHE_SERVICE` abstraction (memory/
/// Redis/disk — same provider the Admin Console's "Cache" page reports
/// on). Deliberately opt-in per-route rather than a global interceptor:
/// most of this API's GET routes return per-caller, frequently-changing
/// data (job status, findings, chat history) where caching would either
/// leak stale reads or need per-request invalidation logic this pass
/// doesn't build. Reach for `@CacheResponse(ttlSeconds)` on routes that
/// are read-heavy, expensive to compute, and safe to serve slightly
/// stale for a short window — e.g. the Knowledge Base reference index,
/// aggregate dashboard/statistics endpoints. `CacheResponseInterceptor`
/// reads this metadata; without it, the interceptor is a no-op passthrough.
export const CacheResponse = (ttlSeconds: number) =>
  SetMetadata(CACHE_RESPONSE_TTL_KEY, ttlSeconds);
