import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import type {
  KnowledgeBaseReferenceEntryRecord,
  KnowledgeBaseReferenceRepository,
} from '../domain/repositories/knowledge-base-reference.repository.interface.js';
import type { AiMemoryService } from '../../ai/memory/ai-memory.service.js';
import { KnowledgeBaseReferenceService } from './knowledge-base-reference.service.js';

/// Module 11 — AI Knowledge Base (task #227) + Performance optimizations
/// (task #235). Covers the in-memory cache (getAllEntries) added in task
/// #235 — listEntries()/search() must not hit the repository on every
/// call, but upsertEntry()/deleteEntry() must invalidate the cache so a
/// write is visible on the very next read — plus the relevance-ranking
/// behavior of search() itself (exact code match ranks first).
function entry(overrides: Partial<KnowledgeBaseReferenceEntryRecord> = {}): KnowledgeBaseReferenceEntryRecord {
  return {
    id: 'kb-1',
    framework: 'CWE',
    code: 'CWE-79',
    title: 'Improper Neutralization of Input During Web Page Generation (XSS)',
    summary: 'Cross-site scripting allows attackers to inject client-side script.',
    url: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildService() {
  const repository = {
    upsert: jest.fn<KnowledgeBaseReferenceRepository['upsert']>(),
    findById: jest.fn<KnowledgeBaseReferenceRepository['findById']>(),
    list: jest.fn<KnowledgeBaseReferenceRepository['list']>(),
    delete: jest.fn<KnowledgeBaseReferenceRepository['delete']>(),
    count: jest.fn<KnowledgeBaseReferenceRepository['count']>(),
  } as unknown as jest.Mocked<KnowledgeBaseReferenceRepository>;
  const memoryService = {
    indexContent: jest.fn(() => Promise.resolve()),
  } as unknown as jest.Mocked<AiMemoryService>;
  const service = new KnowledgeBaseReferenceService(repository, memoryService);
  return { service, repository, memoryService };
}

describe('KnowledgeBaseReferenceService', () => {
  let harness: ReturnType<typeof buildService>;

  beforeEach(() => {
    harness = buildService();
  });

  describe('caching (task #235)', () => {
    it('listEntries() only calls repository.list once across repeated calls', async () => {
      const { service, repository } = harness;
      repository.list.mockResolvedValue([entry(), entry({ id: 'kb-2', code: 'CWE-89' })]);

      await service.listEntries({});
      await service.listEntries({});
      await service.listEntries({ framework: 'CWE' });

      expect(repository.list).toHaveBeenCalledTimes(1);
    });

    it('upsertEntry() invalidates the cache so the next read reflects the write', async () => {
      const { service, repository } = harness;
      repository.list.mockResolvedValueOnce([entry()]);
      await service.listEntries({});
      expect(repository.list).toHaveBeenCalledTimes(1);

      repository.upsert.mockResolvedValue(entry({ id: 'kb-2', code: 'CWE-89' }));
      await service.upsertEntry({
        framework: 'CWE',
        code: 'CWE-89',
        title: 'SQL Injection',
        summary: 'Improper neutralization of special elements in SQL commands.',
      });

      repository.list.mockResolvedValueOnce([entry(), entry({ id: 'kb-2', code: 'CWE-89' })]);
      const after = await service.listEntries({});

      expect(repository.list).toHaveBeenCalledTimes(2);
      expect(after).toHaveLength(2);
    });

    it('deleteEntry() invalidates the cache so a deleted entry disappears on the next read', async () => {
      const { service, repository } = harness;
      repository.list.mockResolvedValueOnce([entry(), entry({ id: 'kb-2', code: 'CWE-89' })]);
      const before = await service.listEntries({});
      expect(before).toHaveLength(2);

      repository.delete.mockResolvedValue(undefined);
      await service.deleteEntry('kb-2');

      repository.list.mockResolvedValueOnce([entry()]);
      const after = await service.listEntries({});

      expect(repository.list).toHaveBeenCalledTimes(2);
      expect(after).toHaveLength(1);
    });
  });

  describe('listEntries filtering', () => {
    it('filters by framework and respects limit', async () => {
      const { service, repository } = harness;
      repository.list.mockResolvedValue([
        entry({ id: 'kb-1', framework: 'CWE', code: 'CWE-79' }),
        entry({ id: 'kb-2', framework: 'OWASP', code: 'A03:2021' }),
        entry({ id: 'kb-3', framework: 'CWE', code: 'CWE-89' }),
      ]);

      const cweOnly = await service.listEntries({ framework: 'CWE' });
      expect(cweOnly).toHaveLength(2);
      expect(cweOnly.every((e) => e.framework === 'CWE')).toBe(true);

      const limited = await service.listEntries({ limit: 1 });
      expect(limited).toHaveLength(1);
    });
  });

  describe('search', () => {
    beforeEach(() => {
      harness.repository.list.mockResolvedValue([
        entry({ id: 'kb-1', framework: 'CWE', code: 'CWE-79', title: 'Cross-Site Scripting (XSS)' }),
        entry({
          id: 'kb-2',
          framework: 'CWE',
          code: 'CWE-89',
          title: 'SQL Injection',
          summary: 'Improper neutralization of SQL special elements.',
        }),
      ]);
    });

    it('returns an empty array for a blank query', async () => {
      const results = await harness.service.search({ query: '   ' });
      expect(results).toEqual([]);
    });

    it('ranks an exact code match first with score 1', async () => {
      const results = await harness.service.search({ query: 'CWE-79' });
      expect(results[0].entry.code).toBe('CWE-79');
      expect(results[0].score).toBe(1);
    });

    it('a code match is case- and punctuation-insensitive', async () => {
      const results = await harness.service.search({ query: 'cwe79' });
      expect(results[0].entry.code).toBe('CWE-79');
      expect(results[0].score).toBe(1);
    });

    it('token matches on title/summary score below an exact code match', async () => {
      const results = await harness.service.search({ query: 'sql injection' });
      expect(results[0].entry.code).toBe('CWE-89');
      expect(results[0].score).toBeLessThan(1);
      expect(results[0].score).toBeGreaterThan(0);
    });

    it('excludes entries that match nothing', async () => {
      const results = await harness.service.search({ query: 'buffer overflow' });
      expect(results).toEqual([]);
    });

    it('respects the framework filter and limit', async () => {
      const results = await harness.service.search({ query: 'injection', framework: 'CWE', limit: 1 });
      expect(results).toHaveLength(1);
    });
  });

  describe('reindexForSemanticSearch', () => {
    it('indexes every cached entry and returns the count indexed', async () => {
      const { service, repository, memoryService } = harness;
      repository.list.mockResolvedValue([entry(), entry({ id: 'kb-2', code: 'CWE-89' })]);

      const indexed = await service.reindexForSemanticSearch('ws-1');

      expect(indexed).toBe(2);
      expect(memoryService.indexContent).toHaveBeenCalledTimes(2);
      expect(memoryService.indexContent).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: 'ws-1', sourceType: 'KNOWLEDGE_BASE_REFERENCE' }),
      );
    });

    it('continues indexing remaining entries when one entry fails', async () => {
      const { service, repository, memoryService } = harness;
      repository.list.mockResolvedValue([entry({ id: 'kb-1' }), entry({ id: 'kb-2', code: 'CWE-89' })]);
      (memoryService.indexContent as jest.Mock)
        .mockRejectedValueOnce(new Error('embedding provider unavailable'))
        .mockResolvedValueOnce(undefined);

      const indexed = await service.reindexForSemanticSearch('ws-1');

      expect(indexed).toBe(1);
      expect(memoryService.indexContent).toHaveBeenCalledTimes(2);
    });
  });
});
