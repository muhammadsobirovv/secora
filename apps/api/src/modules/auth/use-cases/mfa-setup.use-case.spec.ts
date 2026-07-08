import { describe, expect, it, jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { MfaSetupUseCase } from './mfa-setup.use-case.js';
import type { UsersRepository } from '../domain/repositories/users.repository.interface.js';
import type { MfaRepository } from '../domain/repositories/mfa.repository.interface.js';
import type { TotpService } from '../services/totp.service.js';
import type { MfaFactor, User } from '../../../prisma-types.js';

describe('MfaSetupUseCase', () => {
  const userId = 'user-1';
  const user = { id: userId, email: 'user@example.com' } as User;

  function buildUseCase(overrides?: {
    user?: User | null;
    existingFactor?: MfaFactor | null;
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
    };
    const mfaRepository: jest.Mocked<MfaRepository> = {
      findFactorByUserId: jest
        .fn<MfaRepository['findFactorByUserId']>()
        .mockResolvedValue(
          overrides?.existingFactor === undefined
            ? null
            : overrides.existingFactor,
        ),
      createFactor: jest
        .fn<MfaRepository['createFactor']>()
        .mockResolvedValue({ id: 'factor-new' } as MfaFactor),
      confirmFactor: jest.fn(),
      deleteFactor: jest.fn(),
      replaceBackupCodes: jest.fn(),
      findUnusedBackupCodeByHash: jest.fn(),
      consumeBackupCode: jest.fn(),
      createChallengeToken: jest.fn(),
      findValidChallengeTokenByHash: jest.fn(),
      consumeChallengeToken: jest.fn(),
    };
    const totpService = {
      generateSecret: jest.fn().mockReturnValue('SECRET'),
      buildOtpAuthUrl: jest.fn().mockReturnValue('otpauth://...'),
      generateQrCodeDataUrl: jest
        .fn<TotpService['generateQrCodeDataUrl']>()
        .mockResolvedValue('data:image/png;base64,...'),
    } as unknown as jest.Mocked<TotpService>;

    const useCase = new MfaSetupUseCase(
      usersRepository,
      mfaRepository,
      totpService,
    );
    return { useCase, mfaRepository };
  }

  it('creates a fresh factor when none exists', async () => {
    const deps = buildUseCase();

    const result = await deps.useCase.execute(userId);

    expect(deps.mfaRepository.createFactor).toHaveBeenCalledWith(
      userId,
      'SECRET',
    );
    expect(result).toEqual({
      secret: 'SECRET',
      otpAuthUrl: 'otpauth://...',
      qrCodeDataUrl: 'data:image/png;base64,...',
    });
  });

  it('discards an unconfirmed prior factor before creating a fresh one', async () => {
    const deps = buildUseCase({
      existingFactor: { id: 'factor-old', enabled: false } as MfaFactor,
    });

    await deps.useCase.execute(userId);

    expect(deps.mfaRepository.deleteFactor).toHaveBeenCalledWith('factor-old');
    expect(deps.mfaRepository.createFactor).toHaveBeenCalled();
  });

  it('rejects when MFA is already enabled', async () => {
    const deps = buildUseCase({
      existingFactor: { id: 'factor-old', enabled: true } as MfaFactor,
    });

    await expect(deps.useCase.execute(userId)).rejects.toMatchObject({
      code: 'MFA_ALREADY_ENABLED',
    });
    expect(deps.mfaRepository.createFactor).not.toHaveBeenCalled();
  });

  it("rejects when the user doesn't exist", async () => {
    const deps = buildUseCase({ user: null });

    await expect(deps.useCase.execute(userId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
