import { describe, expect, it, jest } from '@jest/globals';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import type { ApiKeysRepository } from '../../api-keys/domain/repositories/api-keys.repository.interface.js';
import { ListApiKeysHandler, ListApiKeysQuery } from './api-keys.query.js';

/// Module 20 security audit regression test. Before this fix,
/// `ListApiKeysHandler` called `apiKeysRepository.findByWorkspace()`
/// whenever a `workspaceId` filter was present with no check at all that
/// the caller actually belongs to that workspace — an IDOR letting any
/// authenticated user enumerate another workspace's API key metadata
/// (name, prefix, scopes, IP allowlist, rate limit) by guessing/
/// discovering a workspaceId. This spec pins the fix: a non-member must
/// be rejected before the repository is ever queried, and a real member
/// must still get their workspace's keys back.
function buildPrisma(isMember: boolean): PrismaService {
  return {
    workspaceMember: {
      findUnique: jest.fn(async () => (isMember ? { role: 'MEMBER' } : null)),
    },
  } as unknown as PrismaService;
}

function buildRepository(keys: unknown[] = []): ApiKeysRepository {
  return {
    findByWorkspace: jest.fn(async () => keys),
    findByUser: jest.fn(async () => keys),
  } as unknown as ApiKeysRepository;
}

describe('ListApiKeysHandler', () => {
  it('throws WORKSPACE_MEMBERSHIP_NOT_FOUND for a non-member and never queries the repository', async () => {
    const prisma = buildPrisma(false);
    const repository = buildRepository();
    const handler = new ListApiKeysHandler(repository, prisma);

    await expect(
      handler.execute(new ListApiKeysQuery('outsider', { workspaceId: 'ws-1' })),
    ).rejects.toMatchObject({ code: 'WORKSPACE_MEMBERSHIP_NOT_FOUND' });
    expect(repository.findByWorkspace).not.toHaveBeenCalled();
  });

  it('returns workspace keys for a real member', async () => {
    const prisma = buildPrisma(true);
    const key = {
      id: 'key-1',
      name: 'CI key',
      workspaceId: 'ws-1',
      prefix: 'phb_abc123',
      scopes: [],
      lastUsedAt: null,
      expiresAt: null,
      revokedAt: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      ipAllowlist: [],
      rateLimitPerMinute: null,
      rotatedFromId: null,
    };
    const repository = buildRepository([key]);
    const handler = new ListApiKeysHandler(repository, prisma);

    const result = await handler.execute(new ListApiKeysQuery('member-1', { workspaceId: 'ws-1' }));
    expect(result).toEqual([expect.objectContaining({ id: 'key-1', workspaceId: 'ws-1' })]);
    expect(repository.findByWorkspace).toHaveBeenCalledWith('ws-1');
  });

  it('falls back to the caller\'s own personal keys when no workspaceId filter is given', async () => {
    const prisma = buildPrisma(true);
    const repository = buildRepository([]);
    const handler = new ListApiKeysHandler(repository, prisma);

    await handler.execute(new ListApiKeysQuery('user-1', {}));
    expect(repository.findByUser).toHaveBeenCalledWith('user-1');
    expect(repository.findByWorkspace).not.toHaveBeenCalled();
    expect(prisma.workspaceMember.findUnique).not.toHaveBeenCalled();
  });
});
