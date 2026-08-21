import { describe, expect, it, jest } from '@jest/globals';
import { RiskEngineV2Service } from './risk-engine-v2.service.js';

/// Module 17 — task #488 (Multi-tenant security tests). `RiskFactorSnapshot`
/// has no `getForWorkspace`-style fetch-then-compare lookup (see
/// `RiskEngineV2Service`'s own file — every read method takes
/// `workspaceId` as its first parameter and threads it straight into the
/// underlying `findFirst`/`findMany` `where` clause). That means
/// isolation here is "by construction" rather than by a post-fetch
/// ownership check — these tests assert the `where` clause actually
/// passed to the mocked Prisma call always includes the *caller's*
/// `workspaceId`, never a hardcoded or omitted one, which is what makes
/// a cross-workspace snapshot structurally unreachable rather than
/// merely filtered out after the fact.

function buildService() {
  const findFirst = jest.fn<(args: unknown) => Promise<unknown>>();
  const findMany = jest.fn<(args: unknown) => Promise<unknown[]>>();
  const prisma = {
    riskFactorSnapshot: { findFirst, findMany },
  } as unknown as ConstructorParameters<typeof RiskEngineV2Service>[0];

  const service = new RiskEngineV2Service(
    prisma,
    {} as ConstructorParameters<typeof RiskEngineV2Service>[1],
    {} as ConstructorParameters<typeof RiskEngineV2Service>[2],
  );
  return { service, findFirst, findMany };
}

describe('RiskEngineV2Service (workspace isolation via query scoping)', () => {
  it('latestForFinding scopes the findFirst where clause to the caller workspace', async () => {
    const { service, findFirst } = buildService();
    findFirst.mockResolvedValue(null);

    await service.latestForFinding('ws-mine', 'finding-1');

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: 'ws-mine', findingId: 'finding-1' } }),
    );
  });

  it('historyForFinding scopes the findMany where clause to the caller workspace', async () => {
    const { service, findMany } = buildService();
    findMany.mockResolvedValue([]);

    await service.historyForFinding('ws-mine', 'finding-1');

    const args = findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(args.where).toMatchObject({ workspaceId: 'ws-mine', findingId: 'finding-1' });
  });

  it('latestForAsset scopes the findFirst where clause to the caller workspace', async () => {
    const { service, findFirst } = buildService();
    findFirst.mockResolvedValue(null);

    await service.latestForAsset('ws-mine', 'HOST', 'asset-1');

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'ws-mine', assetNodeType: 'HOST', assetRefId: 'asset-1' },
      }),
    );
  });

  it('historyForAsset scopes the findMany where clause to the caller workspace', async () => {
    const { service, findMany } = buildService();
    findMany.mockResolvedValue([]);

    await service.historyForAsset('ws-mine', 'HOST', 'asset-1');

    const args = findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(args.where).toMatchObject({ workspaceId: 'ws-mine', assetNodeType: 'HOST', assetRefId: 'asset-1' });
  });

  it('never reuses a workspaceId from a different call — two callers get two distinct scoped queries', async () => {
    const { service, findFirst } = buildService();
    findFirst.mockResolvedValue(null);

    await service.latestForFinding('ws-a', 'finding-1');
    await service.latestForFinding('ws-b', 'finding-1');

    expect(findFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { workspaceId: 'ws-a', findingId: 'finding-1' } }),
    );
    expect(findFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { workspaceId: 'ws-b', findingId: 'finding-1' } }),
    );
  });
});
