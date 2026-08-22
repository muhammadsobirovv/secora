import { describe, expect, it, jest } from '@jest/globals';
import { ThreatMatchService } from './threat-match.service.js';

/// Module 17 — task #496 (Tests: threat matching). Covers the two
/// properties spec section 10 depends on `ThreatMatchService` getting
/// right: (1) matching is by *exact* value equality within a type-
/// compatible node/indicator pair — an IP indicator must never match a
/// DOMAIN node just because some other field lines up — and (2) match
/// confidence is always capped below 1.0 (`MAX_CONFIDENCE = 0.9`), so a
/// match can never present as absolute certainty regardless of how
/// confident the underlying indicator claims to be — the "do NOT
/// automatically declare compromise" hard rule the service's own doc
/// comment cites. Also covers `setAnalystStatus`'s workspace isolation.
/// Hand-rolled Prisma mock, no live DB, same idiom as this session's
/// other M17 specs.

function buildService() {
  const assetGraphNodeFindMany = jest.fn<(args: unknown) => Promise<Record<string, unknown>[]>>();
  const indicatorFindMany = jest.fn<(args: unknown) => Promise<Record<string, unknown>[]>>();
  const threatMatchFindFirst = jest.fn<(args: unknown) => Promise<Record<string, unknown> | null>>();
  const threatMatchCreate = jest.fn<(args: unknown) => Promise<Record<string, unknown>>>();
  const threatMatchUpdate = jest.fn<(args: unknown) => Promise<Record<string, unknown>>>();
  const threatMatchFindUnique = jest.fn<(args: unknown) => Promise<Record<string, unknown> | null>>();

  const prisma = {
    assetGraphNode: { findMany: assetGraphNodeFindMany },
    indicator: { findMany: indicatorFindMany },
    threatMatch: {
      findFirst: threatMatchFindFirst,
      create: threatMatchCreate,
      update: threatMatchUpdate,
      findUnique: threatMatchFindUnique,
      findMany: jest.fn<(args: unknown) => Promise<Record<string, unknown>[]>>(),
    },
  } as unknown as ConstructorParameters<typeof ThreatMatchService>[0];

  const eventBus = { publish: jest.fn() } as unknown as ConstructorParameters<typeof ThreatMatchService>[1];

  const service = new ThreatMatchService(prisma, eventBus);
  return { service, assetGraphNodeFindMany, indicatorFindMany, threatMatchFindFirst, threatMatchCreate, threatMatchFindUnique, threatMatchUpdate };
}

describe('ThreatMatchService.runForTarget', () => {
  it('creates a match with confidence capped at MAX_CONFIDENCE (0.9) even when the indicator confidence is already high', async () => {
    const { service, assetGraphNodeFindMany, indicatorFindMany, threatMatchFindFirst, threatMatchCreate } = buildService();
    assetGraphNodeFindMany.mockResolvedValue([{ id: 'node-1', nodeType: 'IP', refId: '203.0.113.5' }]);
    indicatorFindMany.mockResolvedValue([{ id: 'indicator-1', type: 'IP', value: '203.0.113.5', confidence: 0.95 }]);
    threatMatchFindFirst.mockResolvedValue(null); // no existing match -> create path
    threatMatchCreate.mockResolvedValue({ id: 'match-1' });

    const written = await service.runForTarget('ws-1', 'project-1', 'target-1');

    expect(written).toBe(1);
    const args = threatMatchCreate.mock.calls[0][0] as { data: { confidence: number; workspaceId: string } };
    expect(args.data.confidence).toBeLessThanOrEqual(0.9);
    expect(args.data.workspaceId).toBe('ws-1');
  });

  it('does not match an IP indicator against a DOMAIN node even if the refId string happens to be identical', async () => {
    const { service, assetGraphNodeFindMany, indicatorFindMany, threatMatchCreate } = buildService();
    assetGraphNodeFindMany.mockResolvedValue([{ id: 'node-1', nodeType: 'DOMAIN', refId: 'evil.example.com' }]);
    indicatorFindMany.mockResolvedValue([{ id: 'indicator-1', type: 'IP', value: 'evil.example.com', confidence: 0.9 }]);

    const written = await service.runForTarget('ws-1', 'project-1', 'target-1');

    expect(written).toBe(0);
    expect(threatMatchCreate).not.toHaveBeenCalled();
  });

  it('returns 0 without querying indicators when the target has no scannable asset nodes', async () => {
    const { service, assetGraphNodeFindMany, indicatorFindMany } = buildService();
    assetGraphNodeFindMany.mockResolvedValue([]);

    const written = await service.runForTarget('ws-1', 'project-1', 'target-1');

    expect(written).toBe(0);
    expect(indicatorFindMany).not.toHaveBeenCalled();
  });
});

describe('ThreatMatchService.setAnalystStatus (workspace isolation)', () => {
  it('throws THREAT_MATCH_NOT_FOUND rather than updating a cross-workspace match', async () => {
    const { service, threatMatchFindUnique, threatMatchUpdate } = buildService();
    threatMatchFindUnique.mockResolvedValue({ id: 'match-1', workspaceId: 'ws-someone-elses' });

    await expect(service.setAnalystStatus('match-1', 'ws-mine', 'CONFIRMED')).rejects.toMatchObject({
      code: 'THREAT_MATCH_NOT_FOUND',
    });
    expect(threatMatchUpdate).not.toHaveBeenCalled();
  });
});
