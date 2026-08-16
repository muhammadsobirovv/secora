import { AccessShareLinkCommand, AccessShareLinkHandler } from './access-share-link.command.js';
import { createHash } from 'node:crypto';

/// Module 16 — Public Sharing (task #392). Covers every scenario the
/// spec explicitly calls out under "Add tests for": expired link,
/// revoked link, wrong password, cross-workspace access, and token
/// guessing/enumeration. "Wrong permission" is covered separately in
/// share-permission.util.spec.ts, since permission enforcement is a
/// standalone guard (`assertSharePermission`) rather than something this
/// handler itself decides.
describe('AccessShareLinkHandler', () => {
  const RAW_TOKEN = 'shl_test-token-value';
  const TOKEN_HASH = createHash('sha256').update(RAW_TOKEN).digest('hex');

  function buildHandler(shareLink: Record<string, unknown> | null, overrides: Partial<Record<string, unknown>> = {}) {
    const prisma = {
      shareLink: {
        findUnique: jest.fn().mockResolvedValue(shareLink),
        update: jest.fn().mockResolvedValue({}),
      },
      bugReport: { findUnique: jest.fn().mockResolvedValue({ workspaceId: 'workspace-1', title: 'Report title' }) },
      auditEvent: { create: jest.fn().mockResolvedValue({}) },
      ...overrides,
    };
    const passwordHasher = { verify: jest.fn().mockResolvedValue(true), hash: jest.fn() };
    const handler = new AccessShareLinkHandler(prisma as never, passwordHasher as never);
    return { handler, prisma, passwordHasher };
  }

  const baseShareLink = {
    id: 'share-1',
    workspaceId: 'workspace-1',
    resourceType: 'REPORT',
    resourceId: 'report-1',
    tokenHash: TOKEN_HASH,
    tokenPrefix: 'shl_test-tok',
    passwordHash: null,
    permission: 'VIEW',
    expiresAt: null,
    revokedAt: null,
  };

  // --- Token guessing / enumeration ---------------------------------------
  it('returns a generic not-found for a token that never existed (no info leaked)', async () => {
    const { handler, prisma } = buildHandler(null);
    await expect(handler.execute(new AccessShareLinkCommand('shl_totally-made-up', undefined, '1.2.3.4'))).rejects.toMatchObject({
      code: 'SHARE_LINK_NOT_FOUND',
    });
    // Never hit bugReport lookup or write an audit row keyed to a real
    // link — nothing about a made-up token can be distinguished from
    // any other made-up token.
    expect(prisma.bugReport.findUnique).not.toHaveBeenCalled();
  });

  it('hashes the presented token before lookup — never queries by the raw value', async () => {
    const { handler, prisma } = buildHandler({ ...baseShareLink });
    await handler.execute(new AccessShareLinkCommand(RAW_TOKEN, undefined, '1.2.3.4'));
    expect(prisma.shareLink.findUnique).toHaveBeenCalledWith({ where: { tokenHash: TOKEN_HASH } });
  });

  // --- Revoked link --------------------------------------------------------
  it('rejects a revoked link with 410 Gone and audit-logs the denial', async () => {
    const { handler, prisma } = buildHandler({ ...baseShareLink, revokedAt: new Date() });
    await expect(handler.execute(new AccessShareLinkCommand(RAW_TOKEN, undefined, '1.2.3.4'))).rejects.toMatchObject({
      code: 'SHARE_LINK_EXPIRED_OR_REVOKED',
    });
    expect(prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'SHARE_LINK_ACCESS_DENIED' }) }),
    );
  });

  // --- Expired link --------------------------------------------------------
  it('rejects an expired link with 410 Gone', async () => {
    const { handler } = buildHandler({ ...baseShareLink, expiresAt: new Date(Date.now() - 60_000) });
    await expect(handler.execute(new AccessShareLinkCommand(RAW_TOKEN, undefined, '1.2.3.4'))).rejects.toMatchObject({
      code: 'SHARE_LINK_EXPIRED_OR_REVOKED',
    });
  });

  it('accepts a link with a future expiry', async () => {
    const { handler } = buildHandler({ ...baseShareLink, expiresAt: new Date(Date.now() + 60_000) });
    const result = await handler.execute(new AccessShareLinkCommand(RAW_TOKEN, undefined, '1.2.3.4'));
    expect(result.title).toBe('Report title');
  });

  // --- Wrong password --------------------------------------------------------
  it('rejects a missing password when the link requires one', async () => {
    const { handler } = buildHandler({ ...baseShareLink, passwordHash: 'argon2-hash' });
    await expect(handler.execute(new AccessShareLinkCommand(RAW_TOKEN, undefined, '1.2.3.4'))).rejects.toMatchObject({
      code: 'SHARE_LINK_PASSWORD_REQUIRED',
    });
  });

  it('rejects an incorrect password', async () => {
    const { handler, passwordHasher } = buildHandler({ ...baseShareLink, passwordHash: 'argon2-hash' });
    passwordHasher.verify.mockResolvedValue(false);
    await expect(handler.execute(new AccessShareLinkCommand(RAW_TOKEN, 'wrong-password', '1.2.3.4'))).rejects.toMatchObject({
      code: 'SHARE_LINK_PASSWORD_INCORRECT',
    });
  });

  it('accepts the correct password', async () => {
    const { handler, passwordHasher } = buildHandler({ ...baseShareLink, passwordHash: 'argon2-hash' });
    passwordHasher.verify.mockResolvedValue(true);
    const result = await handler.execute(new AccessShareLinkCommand(RAW_TOKEN, 'correct-password', '1.2.3.4'));
    expect(result.resourceId).toBe('report-1');
  });

  // --- Cross-workspace access ------------------------------------------------
  it('rejects access when the resource has moved to a different workspace than the link was minted for', async () => {
    const { handler, prisma } = buildHandler({ ...baseShareLink });
    prisma.bugReport.findUnique.mockResolvedValue({ workspaceId: 'workspace-OTHER', title: 'Report title' });
    await expect(handler.execute(new AccessShareLinkCommand(RAW_TOKEN, undefined, '1.2.3.4'))).rejects.toMatchObject({
      code: 'SHARE_LINK_NOT_FOUND',
    });
  });

  // --- Successful access: counters + audit ---------------------------------
  it('increments accessCount and records lastAccessedAt on success', async () => {
    const { handler, prisma } = buildHandler({ ...baseShareLink });
    await handler.execute(new AccessShareLinkCommand(RAW_TOKEN, undefined, '1.2.3.4'));
    expect(prisma.shareLink.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'share-1' },
        data: expect.objectContaining({ accessCount: { increment: 1 } }),
      }),
    );
    expect(prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'SHARE_LINK_ACCESSED' }) }),
    );
  });

  // --- Response shape never leaks internal identifiers ----------------------
  it('never returns workspaceId in the resolved response', async () => {
    const { handler } = buildHandler({ ...baseShareLink });
    const result = await handler.execute(new AccessShareLinkCommand(RAW_TOKEN, undefined, '1.2.3.4'));
    expect(result).not.toHaveProperty('workspaceId');
    expect(Object.keys(result).sort()).toEqual(['permission', 'resourceId', 'resourceType', 'title']);
  });
});
