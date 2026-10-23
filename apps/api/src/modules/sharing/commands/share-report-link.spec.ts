import { describe, expect, it, jest } from '@jest/globals';
import {
  CreateShareLinkCommand,
  CreateShareLinkHandler,
} from './share-links.commands.js';
import {
  AccessShareLinkCommand,
  AccessShareLinkHandler,
} from './access-share-link.command.js';
import { createHash } from 'node:crypto';

/// Shared scan reports reuse the share-link mechanism; these tests cover what
/// is specific to them: a mandatory short expiry, revocation, expiry on access,
/// and a response that names the report but not the tenant.

function createHandler() {
  const prisma = {
    vulnScanJob: {
      findUnique: jest.fn(async () => ({
        workspaceId: 'ws-1',
        target: { value: 'shop.example.org' },
      })),
    },
    workspaceMember: { findUnique: jest.fn(async () => ({ role: 'OWNER' })) },
    shareLink: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'sl-1',
        createdAt: new Date(),
        lastAccessedAt: null,
        accessCount: 0,
        revokedAt: null,
        ...data,
      })),
    },
    auditEvent: { create: jest.fn(async () => ({})) },
  };
  return {
    prisma,
    handler: new CreateShareLinkHandler(
      prisma as never,
      { hash: jest.fn() } as never,
    ),
  };
}

const create = (expiresInDays?: number) =>
  new CreateShareLinkCommand('user-1', {
    resourceType: 'VULN_SCAN_REPORT',
    resourceId: 'job-1',
    expiresInDays,
  });

describe('creating a share link for a scan report', () => {
  it('requires an expiry of 1 to 30 days', async () => {
    const { handler, prisma } = createHandler();
    await expect(handler.execute(create(undefined))).rejects.toMatchObject({
      code: 'INVALID_SHARE_EXPIRY',
    });
    await expect(handler.execute(create(31))).rejects.toMatchObject({
      code: 'INVALID_SHARE_EXPIRY',
    });
    await expect(handler.execute(create(0))).rejects.toMatchObject({
      code: 'INVALID_SHARE_EXPIRY',
    });
    expect(prisma.shareLink.create).not.toHaveBeenCalled();
  });

  it('creates a read-only link that expires, checks the caller belongs to the workspace, and audits it', async () => {
    const { handler, prisma } = createHandler();
    const link = await handler.execute(create(7));
    expect(link.resourceType).toBe('VULN_SCAN_REPORT');
    expect(link.permission).toBe('VIEW');
    const days =
      (new Date(link.expiresAt!).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
    expect(prisma.workspaceMember.findUnique).toHaveBeenCalled();
    expect(prisma.auditEvent.create).toHaveBeenCalled();
    // Only the hash of the token is stored.
    const stored = prisma.shareLink.create.mock.calls[0][0].data as {
      tokenHash: string;
    };
    expect(stored.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(link.token.startsWith('shl_')).toBe(true);
  });

  it("refuses a caller who is not in the report's workspace", async () => {
    const { handler, prisma } = createHandler();
    prisma.workspaceMember.findUnique.mockResolvedValueOnce(null as never);
    await expect(handler.execute(create(7))).rejects.toMatchObject({
      status: 403,
    });
    expect(prisma.shareLink.create).not.toHaveBeenCalled();
  });
});

describe('opening a shared scan report', () => {
  const RAW = 'shl_report-token';
  const link = (o: Record<string, unknown> = {}) => ({
    id: 'sl-1',
    workspaceId: 'ws-1',
    resourceType: 'VULN_SCAN_REPORT',
    resourceId: 'job-1',
    tokenHash: createHash('sha256').update(RAW).digest('hex'),
    passwordHash: null,
    permission: 'VIEW',
    expiresAt: new Date(Date.now() + 86_400_000),
    revokedAt: null,
    ...o,
  });
  function access(shareLink: Record<string, unknown> | null) {
    const prisma = {
      shareLink: {
        findUnique: jest.fn(async () => shareLink),
        update: jest.fn(async () => ({})),
      },
      vulnScanJob: {
        findUnique: jest.fn(async () => ({
          workspaceId: 'ws-1',
          target: { value: 'shop.example.org' },
        })),
      },
      auditEvent: { create: jest.fn(async () => ({})) },
    };
    return {
      prisma,
      handler: new AccessShareLinkHandler(
        prisma as never,
        { verify: jest.fn() } as never,
      ),
    };
  }

  it('resolves a live link without exposing the workspace', async () => {
    const { handler } = access(link());
    const out = await handler.execute(
      new AccessShareLinkCommand(RAW, undefined, '1.2.3.4'),
    );
    expect(out).toEqual({
      resourceType: 'VULN_SCAN_REPORT',
      resourceId: 'job-1',
      title: 'Security report: shop.example.org',
      permission: 'VIEW',
    });
    expect(JSON.stringify(out)).not.toContain('ws-1');
  });

  it('stops working after expiry and after revocation', async () => {
    const expired = access(link({ expiresAt: new Date(Date.now() - 1000) }));
    await expect(
      expired.handler.execute(
        new AccessShareLinkCommand(RAW, undefined, '1.2.3.4'),
      ),
    ).rejects.toMatchObject({ status: 410 });
    const revoked = access(link({ revokedAt: new Date() }));
    await expect(
      revoked.handler.execute(
        new AccessShareLinkCommand(RAW, undefined, '1.2.3.4'),
      ),
    ).rejects.toMatchObject({ status: 410 });
  });

  it('an unknown token is a plain 404', async () => {
    const { handler } = access(null);
    await expect(
      handler.execute(
        new AccessShareLinkCommand('shl_nope', undefined, '1.2.3.4'),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
});
