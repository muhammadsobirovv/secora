/// Port. Module 14 — Cache abstraction. Three bindings (`providers.module.ts`
/// selects one via `CACHE_PROVIDER`): `MemoryCacheService` (Community
/// Edition default, single-process, zero configuration),
/// `RedisCacheService` (multi-replica deployments that need a shared
/// cache), `DiskCacheService` (filesystem-backed — trades memory for
/// cache survival across process restarts on a single, memory-
/// constrained box). Every implementation is a plain get/set/delete
/// with a TTL — deliberately not a full `cache-manager`-style
/// tag/namespace system, since the one real consumer this pass migrates
/// (Module 11's Knowledge Base ad-hoc `Map`-based cache) only ever
/// needed key+TTL.
export interface CacheService {
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  /// Admin Console "Cache" page — `entryCount`/`hitRate` are `null` for
  /// providers where computing them cheaply isn't possible (Redis: would
  /// require `INFO`/keyspace scanning beyond this abstraction's scope).
  stats(): Promise<{ entryCount: number | null; hitRate: number | null }>;
}
