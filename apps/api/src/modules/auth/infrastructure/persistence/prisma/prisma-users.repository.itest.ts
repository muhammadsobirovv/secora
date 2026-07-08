import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { createRealPrismaService } from '../../../../../test-utils/real-prisma-service.js';
import { createRealTransactionHost } from '../../../../../test-utils/real-prisma-transaction-host.js';
import { PrismaUsersRepository } from './prisma-users.repository.js';
import type { PrismaService } from '../../../../../prisma/prisma.service.js';

/// Runs against the real local dev Postgres — see docs/modules/01-auth.md
/// "Local development database". Covers just the query logic; business
/// flows around these queries are covered by the use-case unit tests and
/// the e2e suite.
describe('PrismaUsersRepository (integration)', () => {
  let prisma: PrismaService;
  let repository: PrismaUsersRepository;
  const email = `itest-users-${Date.now()}@example.com`;

  beforeAll(() => {
    prisma = createRealPrismaService();
    repository = new PrismaUsersRepository(createRealTransactionHost(prisma));
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it('creates and finds a user by id and by email', async () => {
    const created = await repository.create({
      email,
      passwordHash: 'hash',
      displayName: 'Integration User',
      emailVerified: false,
    });

    expect(created.id).toEqual(expect.any(String));

    const byId = await repository.findById(created.id);
    const byEmail = await repository.findByEmail(email);
    expect(byId?.email).toBe(email);
    expect(byEmail?.id).toBe(created.id);
  });

  it('returns null for a nonexistent user', async () => {
    expect(
      await repository.findByEmail('does-not-exist@example.com'),
    ).toBeNull();
  });

  it('tracks failed login attempts and resets them', async () => {
    const user = await repository.findByEmail(email);
    if (!user) throw new Error('fixture user missing');

    const afterOneFailure = await repository.recordFailedLogin(user.id);
    expect(afterOneFailure.failedLoginCount).toBe(1);

    const afterTwoFailures = await repository.recordFailedLogin(user.id);
    expect(afterTwoFailures.failedLoginCount).toBe(2);

    await repository.resetFailedLogin(user.id);
    const reset = await repository.findById(user.id);
    expect(reset?.failedLoginCount).toBe(0);
    expect(reset?.lockedUntil).toBeNull();
  });

  it('locks and unlocks via lockUntil/resetFailedLogin', async () => {
    const user = await repository.findByEmail(email);
    if (!user) throw new Error('fixture user missing');
    const until = new Date(Date.now() + 60_000);

    await repository.lockUntil(user.id, until);
    const locked = await repository.findById(user.id);
    expect(locked?.lockedUntil?.getTime()).toBe(until.getTime());
    expect(locked?.failedLoginCount).toBe(0);
  });

  it('sets emailVerified and updates the password hash', async () => {
    const user = await repository.findByEmail(email);
    if (!user) throw new Error('fixture user missing');

    await repository.setEmailVerified(user.id);
    await repository.updatePasswordHash(user.id, 'new-hash');

    const updated = await repository.findById(user.id);
    expect(updated?.emailVerified).toBe(true);
    expect(updated?.passwordHash).toBe('new-hash');
  });
});
