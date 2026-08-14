import { describe, expect, it, jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { GetCurrentUserUseCase } from './get-current-user.use-case.js';
import type { UsersRepository } from '../domain/repositories/users.repository.interface.js';
import type { MfaRepository } from '../domain/repositories/mfa.repository.interface.js';
import type { MfaFactor, User } from '../../../prisma-types.js';

describe('GetCurrentUserUseCase', () => {
  const user = {
    id: 'user-1',
    email: 'user@example.com',
    displayName: 'Test User',
    emailVerified: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  } as User;

  function buildUseCase(overrides?: {
    user?: User | null;
    mfaFactor?: MfaFactor | null;
  }) {
    const usersRepository: jest.Mocked<UsersRepository> = {
      findById: jest
        .fn<UsersRepository['findById']>()
        .mockResolvedValue(
          overrides?.user === undefined ? user : overrides.user,
        ),
      findByEmail: jest.fn(),
      create: jest.fn(),
      updatePasswordHash: jest.fn(),
      setEmailVerified: jest.fn(),
      recordFailedLogin: jest.fn(),
      resetFailedLogin: jest.fn(),
      lockUntil: jest.fn(),
      markDeleted: jest.fn(),
    };
    const mfaRepository: jest.Mocked<MfaRepository> = {
      findFactorByUserId: jest
        .fn<MfaRepository['findFactorByUserId']>()
        .mockResolvedValue(
          overrides?.mfaFactor === undefined ? null : overrides.mfaFactor,
        ),
      createFactor: jest.fn(),
      confirmFactor: jest.fn(),
      deleteFactor: jest.fn(),
      replaceBackupCodes: jest.fn(),
      findUnusedBackupCodeByHash: jest.fn(),
      consumeBackupCode: jest.fn(),
      createChallengeToken: jest.fn(),
      findValidChallengeTokenByHash: jest.fn(),
      consumeChallengeToken: jest.fn(),
    };

    return {
      useCase: new GetCurrentUserUseCase(usersRepository, mfaRepository),
    };
  }

  it("returns mfaEnabled=false when there's no MFA factor", async () => {
    const { useCase } = buildUseCase();

    const result = await useCase.execute('user-1');

    expect(result.mfaEnabled).toBe(false);
    expect(result.email).toBe(user.email);
  });

  it('returns mfaEnabled=true when an enabled factor exists', async () => {
    const { useCase } = buildUseCase({
      mfaFactor: { enabled: true } as MfaFactor,
    });

    const result = await useCase.execute('user-1');

    expect(result.mfaEnabled).toBe(true);
  });

  it("throws when the user doesn't exist", async () => {
    const { useCase } = buildUseCase({ user: null });

    await expect(useCase.execute('user-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
