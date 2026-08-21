import { describe, expect, it, jest } from '@jest/globals';
import { IndicatorsService } from './indicators.service.js';

/// Module 17 — task #488 (Multi-tenant security tests). `Indicator`
/// deliberately uses a two-tier scoping model (see `IndicatorsService`'s
/// own doc comment): `workspaceId: null` rows are the shared/global
/// threat-intel cache, visible to every workspace by design — that is
/// NOT a leak. A non-null `workspaceId` row is one workspace's own
/// private/manually-imported indicator and must be isolated exactly
/// like every other M17 entity. These tests cover both halves of that
/// contract, plus the intentional asymmetry that `setStatus` (a write
/// path) does NOT extend the same "shared cache" exemption a read via
/// `getForWorkspace` gets — a workspace can read a global indicator but
/// can never disable/expire one that isn't its own.

function indicatorRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'indicator-1',
    workspaceId: 'ws-mine',
    type: 'IP',
    value: '203.0.113.5',
    status: 'ACTIVE',
    confidence: 0.6,
    source: 'MANUAL_IMPORT',
    description: null,
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
    expiresAt: null,
    tags: [],
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildService() {
  const findUnique = jest.fn<(args: unknown) => Promise<unknown>>();
  const update = jest.fn<(args: unknown) => Promise<unknown>>();
  const prisma = {
    indicator: { findUnique, update },
  } as unknown as ConstructorParameters<typeof IndicatorsService>[0];

  const service = new IndicatorsService(prisma);
  return { service, findUnique, update };
}

describe('IndicatorsService.getForWorkspace (workspace isolation)', () => {
  it('returns a private indicator that belongs to the caller workspace', async () => {
    const { service, findUnique } = buildService();
    findUnique.mockResolvedValue(indicatorRow({ workspaceId: 'ws-mine' }));

    const result = await service.getForWorkspace('indicator-1', 'ws-mine');
    expect(result.id).toBe('indicator-1');
  });

  it('throws INDICATOR_NOT_FOUND for another workspace\'s private indicator', async () => {
    const { service, findUnique } = buildService();
    findUnique.mockResolvedValue(indicatorRow({ workspaceId: 'ws-someone-elses' }));

    await expect(service.getForWorkspace('indicator-1', 'ws-mine')).rejects.toMatchObject({
      code: 'INDICATOR_NOT_FOUND',
    });
  });

  it('throws the identical INDICATOR_NOT_FOUND when the indicator simply does not exist', async () => {
    const { service, findUnique } = buildService();
    findUnique.mockResolvedValue(null);

    await expect(service.getForWorkspace('indicator-missing', 'ws-mine')).rejects.toMatchObject({
      code: 'INDICATOR_NOT_FOUND',
    });
  });

  it('returns a shared (workspaceId: null) indicator for any workspace — intentional, not a leak', async () => {
    const { service, findUnique } = buildService();
    findUnique.mockResolvedValue(indicatorRow({ workspaceId: null }));

    const result = await service.getForWorkspace('indicator-1', 'ws-mine');
    expect(result.workspaceId).toBeNull();
  });
});

describe('IndicatorsService.setStatus (write path — no shared-cache exemption)', () => {
  it('throws INDICATOR_NOT_FOUND rather than mutating another workspace\'s private indicator', async () => {
    const { service, findUnique, update } = buildService();
    findUnique.mockResolvedValue(indicatorRow({ workspaceId: 'ws-someone-elses' }));

    await expect(service.setStatus('indicator-1', 'ws-mine', 'DISABLED')).rejects.toMatchObject({
      code: 'INDICATOR_NOT_FOUND',
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('throws INDICATOR_NOT_FOUND for a shared (workspaceId: null) indicator — write paths never get the read-path exemption', async () => {
    const { service, findUnique, update } = buildService();
    findUnique.mockResolvedValue(indicatorRow({ workspaceId: null }));

    await expect(service.setStatus('indicator-1', 'ws-mine', 'DISABLED')).rejects.toMatchObject({
      code: 'INDICATOR_NOT_FOUND',
    });
    expect(update).not.toHaveBeenCalled();
  });
});
