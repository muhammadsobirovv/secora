import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type {
  KnowledgeBaseReferenceEntryDto,
  KnowledgeBaseReferenceFramework,
  KnowledgeBaseReferenceSearchResultDto,
} from '@pentesthub/shared';
import {
  KNOWLEDGE_BASE_REFERENCE_REPOSITORY,
  type KnowledgeBaseReferenceEntryRecord,
  type KnowledgeBaseReferenceRepository,
} from '../domain/repositories/knowledge-base-reference.repository.interface.js';
import { AiMemoryService } from '../../ai/memory/ai-memory.service.js';
import { toKnowledgeBaseReferenceEntryDto } from '../mappers/to-knowledge-base-reference-dto.mapper.js';
import { KNOWLEDGE_BASE_REFERENCE_SEED_DATA } from './knowledge-base-reference-seed.data.js';
import { CACHE_SERVICE } from '../../../common/providers/tokens.js';
import type { CacheService } from '../../../common/providers/cache/cache-service.interface.js';

const CACHE_KEY = 'agent:knowledge-base-reference:all-entries';
// The catalog is curated (upserts happen rarely), not request-driven —
// a generous TTL keeps Redis/Disk-backed deployments from re-querying
// Postgres on every cache miss window, while the explicit
// invalidate-on-write below (delete() after every upsert/delete) means
// this TTL is really just a safety net for the rare case an
// invalidation is somehow missed, not the primary consistency mechanism.
const CACHE_TTL_SECONDS = 3_600;

/// The AI Knowledge Base (task #227) — a searchable index over the
/// canonical OWASP/CWE/CAPEC/MITRE ATT&CK/NIST/CVE catalog. Search is
/// plain relevance-ranked text matching over the (small, bounded)
/// reference catalog itself rather than a semantic/embedding search —
/// deliberately: this catalog is a few hundred well-curated entries with
/// exact, well-known identifiers ("CWE-79", "T1190"), so a security
/// analyst or an agent citing one almost always knows the code or a
/// close paraphrase of the title, and exact/substring matching is both
/// cheaper (no embedding API call per lookup) and more precise than
/// approximate nearest-neighbor search for that access pattern.
/// `reindexForSemanticSearch` still exists for the case an agent *does*
/// want this catalog folded into its normal RAG recall (AiMemoryService)
/// alongside findings/notes/recon data — opt-in per workspace, not run
/// automatically, since embedding the whole catalog costs one provider
/// call per entry per workspace.
@Injectable()
export class KnowledgeBaseReferenceService implements OnModuleInit {
  private readonly logger = new Logger(KnowledgeBaseReferenceService.name);

  /// Module 11 — Performance optimizations (task #235). The whole catalog
  /// is a few hundred rows at most and changes only via upsertEntry/
  /// deleteEntry (an admin/curation action, not a hot path) or the one-time
  /// boot seed — so search()/listEntries(), which ARE hot paths (an agent
  /// tool call per orchestration task), don't need a DB round-trip every
  /// time. Invalidated on every write; repopulated lazily on the next read.
  ///
  /// Module 14 — migrated from a plain in-process field to the
  /// `CacheService` abstraction (task: Cache abstraction) — the first
  /// real consumer of `CACHE_SERVICE`, proving the abstraction against
  /// an actual hot path rather than shipping unused. Works correctly
  /// against all three providers: `MemoryCacheService` stores by
  /// reference (Date objects survive untouched); `RedisCacheService`/
  /// `DiskCacheService` JSON-serialize, so `createdAt`/`updatedAt` come
  /// back as ISO strings — `reviveDates()` below normalizes both cases
  /// back to real `Date` objects before returning, since
  /// `toKnowledgeBaseReferenceEntryDto` calls `.toISOString()` on them.
  constructor(
    @Inject(KNOWLEDGE_BASE_REFERENCE_REPOSITORY)
    private readonly repository: KnowledgeBaseReferenceRepository,
    private readonly memoryService: AiMemoryService,
    @Inject(CACHE_SERVICE) private readonly cache: CacheService,
  ) {}

  private reviveDates(record: KnowledgeBaseReferenceEntryRecord): KnowledgeBaseReferenceEntryRecord {
    return {
      ...record,
      createdAt: record.createdAt instanceof Date ? record.createdAt : new Date(record.createdAt),
      updatedAt: record.updatedAt instanceof Date ? record.updatedAt : new Date(record.updatedAt),
    };
  }

  private async getAllEntries(): Promise<KnowledgeBaseReferenceEntryRecord[]> {
    const cached = await this.cache.get<KnowledgeBaseReferenceEntryRecord[]>(CACHE_KEY);
    if (cached !== null) {
      return cached.map((record) => this.reviveDates(record));
    }
    const entries = await this.repository.list({ limit: 1000 });
    await this.cache.set(CACHE_KEY, entries, CACHE_TTL_SECONDS);
    return entries;
  }

  /// Seeds the baseline catalog on boot. Safe to run every startup: each
  /// row is an `upsert` keyed on (framework, code), so re-running this
  /// against an already-seeded database is a no-op set of updates, and a
  /// newer deployment that ships additional seed rows self-heals existing
  /// databases without a migration.
  async onModuleInit(): Promise<void> {
    try {
      await Promise.all(
        KNOWLEDGE_BASE_REFERENCE_SEED_DATA.map((entry) => this.repository.upsert(entry)),
      );
      await this.cache.delete(CACHE_KEY);
      const count = await this.repository.count();
      this.logger.log(`AI Knowledge Base catalog ready (${count} reference entries).`);
    } catch (error) {
      // Non-fatal — the platform still functions without the reference
      // catalog seeded (e.g. first boot before migrations have run in a
      // fresh environment); the next successful boot retries.
      this.logger.warn(`Failed to seed AI Knowledge Base catalog: ${String(error)}`);
    }
  }

  async upsertEntry(input: {
    framework: KnowledgeBaseReferenceFramework;
    code: string;
    title: string;
    summary: string;
    url?: string;
    metadata?: Record<string, unknown>;
  }): Promise<KnowledgeBaseReferenceEntryDto> {
    const record = await this.repository.upsert(input);
    await this.cache.delete(CACHE_KEY);
    return toKnowledgeBaseReferenceEntryDto(record);
  }

  async getEntry(id: string): Promise<KnowledgeBaseReferenceEntryDto | null> {
    const record = await this.repository.findById(id);
    return record ? toKnowledgeBaseReferenceEntryDto(record) : null;
  }

  async listEntries(filter: {
    framework?: KnowledgeBaseReferenceFramework;
    limit?: number;
  }): Promise<KnowledgeBaseReferenceEntryDto[]> {
    const all = await this.getAllEntries();
    const filtered = filter.framework
      ? all.filter((r) => r.framework === filter.framework)
      : all;
    const limit = filter.limit ?? 100;
    return filtered.slice(0, limit).map(toKnowledgeBaseReferenceEntryDto);
  }

  async deleteEntry(id: string): Promise<void> {
    await this.repository.delete(id);
    await this.cache.delete(CACHE_KEY);
  }

  /// Relevance-ranked search over the catalog. Exact code match (e.g.
  /// "cwe-79" against code "CWE-79") always ranks first (score 1); every
  /// other entry is scored by how many lowercased query tokens appear in
  /// its code/title/summary, normalized to 0..1.
  async search(input: {
    query: string;
    framework?: KnowledgeBaseReferenceFramework;
    limit?: number;
  }): Promise<KnowledgeBaseReferenceSearchResultDto[]> {
    const limit = input.limit ?? 10;
    const all = await this.getAllEntries();
    const records = input.framework
      ? all.filter((r) => r.framework === input.framework)
      : all;

    const normalizedQuery = input.query.trim().toLowerCase();
    if (!normalizedQuery) return [];
    const tokens = normalizedQuery.split(/\s+/).filter(Boolean);

    const scored = records
      .map((record) => {
        const code = record.code.toLowerCase();
        const haystack = `${code} ${record.title.toLowerCase()} ${record.summary.toLowerCase()}`;

        if (code === normalizedQuery || code.replace(/[^a-z0-9]/g, '') === normalizedQuery.replace(/[^a-z0-9]/g, '')) {
          return { record, score: 1 };
        }

        const matchedTokens = tokens.filter((t) => haystack.includes(t));
        if (matchedTokens.length === 0) return { record, score: 0 };
        const score = Math.min(0.95, matchedTokens.length / tokens.length);
        return { record, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scored.map(({ record, score }) => ({
      entry: toKnowledgeBaseReferenceEntryDto(record),
      score,
    }));
  }

  /// Opt-in: folds the whole catalog into a workspace's normal RAG store
  /// (AiMemoryService/AiMemoryChunk) as KNOWLEDGE_BASE_REFERENCE chunks, so
  /// agents recalling context via AiMemoryService.search() surface catalog
  /// entries alongside findings/notes/recon data in one unified semantic
  /// search rather than needing to separately call this.search() too.
  /// Idempotent per entry (indexContent replaces by sourceId), but does
  /// cost one embedding call per entry — call sparingly (e.g. once per
  /// workspace on first use), never on a hot path.
  async reindexForSemanticSearch(workspaceId: string): Promise<number> {
    const records = await this.getAllEntries();
    let indexed = 0;
    for (const record of records) {
      try {
        await this.memoryService.indexContent({
          workspaceId,
          projectId: null,
          sourceType: 'KNOWLEDGE_BASE_REFERENCE',
          sourceId: record.id,
          content: `[${record.framework} ${record.code}] ${record.title}\n${record.summary}`,
          metadata: { framework: record.framework, code: record.code },
        });
        indexed += 1;
      } catch (error) {
        this.logger.warn(
          `Failed to index KB reference ${record.framework}:${record.code} for workspace ${workspaceId}: ${String(error)}`,
        );
      }
    }
    return indexed;
  }
}
