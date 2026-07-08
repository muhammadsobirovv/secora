import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { createRealPrismaService } from '../../../../../test-utils/real-prisma-service.js';
import { createRealTransactionHost } from '../../../../../test-utils/real-prisma-transaction-host.js';
import { PrismaMfaRepository } from './prisma-mfa.repository.js';
import type { PrismaService } from '../../../../../prisma/prisma.service.js';

describe('PrismaMfaRepository (integration)', () => {
  let prisma: PrismaService;
  let repository: PrismaMfaRepository;
  let userId: string;
  const email = `itest-mfa-${Date.now()}@example.com`;

  beforeAll(async () => {
    prisma = createRealPrismaService();
    repository = new PrismaMfaRepository(createRealTransactionHost(prisma));

    const user = await prisma.user.create({
      data: { email, displayName: 'MFA Fixture', emailVerified: true },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it('creates, confirms, and deletes a factor', async () => {
    const factor = await repository.createFactor(userId, 'SECRET123');
    expect(factor.enabled).toBe(false);

    await repository.confirmFactor(factor.id);
    const confirmed = await repository.findFactorByUserId(userId);
    expect(confirmed?.enabled).toBe(true);
    expect(confirmed?.confirmedAt).not.toBeNull();

    await repository.deleteFactor(factor.id);
    expect(await repository.findFactorByUserId(userId)).toBeNull();
  });

  it('replaces backup codes and consumes them exactly once', async () => {
    const factor = await repository.createFactor(userId, 'SECRET456');

    await repository.replaceBackupCodes(factor.id, [
      'hash-1',
      'hash-2',
      'hash-3',
    ]);

    const found = await repository.findUnusedBackupCodeByHash(
      factor.id,
      'hash-1',
    );
    expect(found).not.toBeNull();

    await repository.consumeBackupCode(found!.id);

    expect(
      await repository.findUnusedBackupCodeByHash(factor.id, 'hash-1'),
    ).toBeNull();
    // Consuming one code doesn't affect the others.
    expect(
      await repository.findUnusedBackupCodeByHash(factor.id, 'hash-2'),
    ).not.toBeNull();

    await repository.deleteFactor(factor.id);
  });

  it('replaceBackupCodes discards the previous set entirely', async () => {
    const factor = await repository.createFactor(userId, 'SECRET789');
    await repository.replaceBackupCodes(factor.id, ['old-1', 'old-2']);

    await repository.replaceBackupCodes(factor.id, ['new-1']);

    expect(
      await repository.findUnusedBackupCodeByHash(factor.id, 'old-1'),
    ).toBeNull();
    expect(
      await repository.findUnusedBackupCodeByHash(factor.id, 'new-1'),
    ).not.toBeNull();

    await repository.deleteFactor(factor.id);
  });

  it('creates a challenge token, finds it while valid, and rejects it once consumed', async () => {
    const token = await repository.createChallengeToken(
      userId,
      'challenge-hash',
      new Date(Date.now() + 60_000),
    );

    const found =
      await repository.findValidChallengeTokenByHash('challenge-hash');
    expect(found?.id).toBe(token.id);

    await repository.consumeChallengeToken(token.id);

    expect(
      await repository.findValidChallengeTokenByHash('challenge-hash'),
    ).toBeNull();
  });

  it('does not return an expired challenge token', async () => {
    await repository.createChallengeToken(
      userId,
      'expired-hash',
      new Date(Date.now() - 1000),
    );

    expect(
      await repository.findValidChallengeTokenByHash('expired-hash'),
    ).toBeNull();
  });
});
