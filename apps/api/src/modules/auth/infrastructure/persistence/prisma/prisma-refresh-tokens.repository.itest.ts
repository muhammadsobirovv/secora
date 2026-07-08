import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { createRealPrismaService } from '../../../../../test-utils/real-prisma-service.js';
import { createRealTransactionHost } from '../../../../../test-utils/real-prisma-transaction-host.js';
import { PrismaRefreshTokensRepository } from './prisma-refresh-tokens.repository.js';
import type { PrismaService } from '../../../../../prisma/prisma.service.js';

describe('PrismaRefreshTokensRepository (integration)', () => {
  let prisma: PrismaService;
  let repository: PrismaRefreshTokensRepository;
  let userId: string;
  let sessionId: string;
  const email = `itest-refresh-${Date.now()}@example.com`;

  beforeAll(async () => {
    prisma = createRealPrismaService();
    repository = new PrismaRefreshTokensRepository(
      createRealTransactionHost(prisma),
    );

    const user = await prisma.user.create({
      data: {
        email,
        displayName: 'Refresh Token Fixture',
        emailVerified: true,
      },
    });
    userId = user.id;
    const session = await prisma.session.create({
      data: {
        userId,
        deviceName: 'test',
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      },
    });
    sessionId = session.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it('creates a token and finds it by hash', async () => {
    const token = await repository.create({
      userId,
      sessionId,
      tokenHash: 'hash-a',
      expiresAt: new Date(Date.now() + 60_000),
    });

    const found = await repository.findByHash('hash-a');
    expect(found?.id).toBe(token.id);
  });

  it('links a rotation chain via markRotated', async () => {
    const oldToken = await repository.create({
      userId,
      sessionId,
      tokenHash: 'hash-old',
      expiresAt: new Date(Date.now() + 60_000),
    });
    const newToken = await repository.create({
      userId,
      sessionId,
      tokenHash: 'hash-new',
      expiresAt: new Date(Date.now() + 60_000),
    });

    await repository.markRotated(oldToken.id, newToken.id);

    const reloaded = await repository.findByHash('hash-old');
    expect(reloaded?.revokedAt).not.toBeNull();
    expect(reloaded?.replacedByTokenId).toBe(newToken.id);
  });

  it('revokes every token in a session via revokeAllForSession', async () => {
    const freshSession = await prisma.session.create({
      data: {
        userId,
        deviceName: 'test-2',
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      },
    });
    const t1 = await repository.create({
      userId,
      sessionId: freshSession.id,
      tokenHash: 'hash-b1',
      expiresAt: new Date(Date.now() + 60_000),
    });
    const t2 = await repository.create({
      userId,
      sessionId: freshSession.id,
      tokenHash: 'hash-b2',
      expiresAt: new Date(Date.now() + 60_000),
    });

    await repository.revokeAllForSession(freshSession.id);

    const reloaded1 = await repository.findByHash('hash-b1');
    const reloaded2 = await repository.findByHash('hash-b2');
    expect(reloaded1?.revokedAt).not.toBeNull();
    expect(reloaded2?.revokedAt).not.toBeNull();
    expect(t1.id).not.toBe(t2.id);
  });
});
