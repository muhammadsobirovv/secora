import { describe, expect, it, jest } from '@jest/globals';
import { MfaDisableUseCase } from './mfa-disable.use-case.js';
import type { UsersRepository } from '../domain/repositories/users.repository.interface.js';
import type { MfaRepository } from '../domain/repositories/mfa.repository.interface.js';
import type { PasswordHasherService } from '../services/password-hasher.service.js';
import type { TokenService } from '../services/token.service.js';
import type { TotpService } from '../services/totp.service.js';
import type { AuditService } from '../../audit/audit.service.js';
import type { MfaFactor, User } from '../../../prisma-types.js';

describe('MfaDisableUseCase', () => {
  const baseInput = {
    code: '123456',
    currentPassword: 'correct-horse-battery',
    userId: 'user-1',
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
  };
  const user = { id: 'user-1', passwordHash: 'old-hash' } as User;
  const enabledFactor = {
    id: 'factor-1',
    secret: 'SECRET',
    enabled: true,
  } as MfaFactor;

  function buildUseCase(overrides?: {
    factor?: MfaFactor | null;
    totpValid?: boolean;
    backupCode?: unknown;
    user?: User | null;
    passwordValid?: boolean;
  }) {
    const mfaRepository: jest.Mocked<MfaRepository> = {
      findFactorByUserId: jest
        .fn<MfaRepository['findFactorByUserId']>()
        .mockResolvedValue(
          overrides?.factor === undefined ? enabledFactor : overrides.factor,
        ),
      createFactor: jest.fn(),
      confirmFactor: jest.fn(),
      deleteFactor: jest.fn(),
      replaceBackupCodes: jest.fn(),
      findUnusedBackupCodeByHash: jest
        .fn<MfaRepository['findUnusedBackupCodeByHash']>()
        .mockResolvedValue((overrides?.backupCode ?? null) as never),
      consumeBackupCode: jest.fn(),
      createChallengeToken: jest.fn(),
      findValidChallengeTokenByHash: jest.fn(),
      consumeChallengeToken: jest.fn(),
    };
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
    const passwordHasher = {
      hash: jest.fn(),
      verify: jest
        .fn<PasswordHasherService['verify']>()
        .mockResolvedValue(overrides?.passwordValid ?? true),
    } as unknown as jest.Mocked<PasswordHasherService>;
    const tokenService = {
      hashOpaqueToken: jest.fn().mockReturnValue('hashed'),
    } as unknown as jest.Mocked<TokenService>;
    const totpService = {
      verifyCode: jest
        .fn<TotpService['verifyCode']>()
        .mockResolvedValue(overrides?.totpValid ?? true),
    } as unknown as jest.Mocked<TotpService>;
    const auditService = {
      log: jest.fn(),
    } as unknown as jest.Mocked<AuditService>;

    const useCase = new MfaDisableUseCase(
      mfaRepository,
      usersRepository,
      passwordHasher,
      tokenService,
      totpService,
      auditService,
    );
    return { useCase, mfaRepository, usersRepository, auditService };
  }

  it('deletes the factor on a valid TOTP code', async () => {
    const deps = buildUseCase();

    await deps.useCase.execute(baseInput);

    expect(deps.mfaRepository.deleteFactor).toHaveBeenCalledWith('factor-1');
    expect(deps.auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'MFA_DISABLED' }),
    );
  });

  it('accepts a valid backup code as an alternative to the TOTP code', async () => {
    const deps = buildUseCase({
      totpValid: false,
      backupCode: { id: 'backup-1' },
    });

    await deps.useCase.execute(baseInput);

    expect(deps.mfaRepository.deleteFactor).toHaveBeenCalledWith('factor-1');
  });

  it("rejects when MFA isn't enabled", async () => {
    const deps = buildUseCase({ factor: null });

    await expect(deps.useCase.execute(baseInput)).rejects.toMatchObject({
      code: 'MFA_NOT_ENABLED',
    });
  });

  it('rejects an invalid code', async () => {
    const deps = buildUseCase({ totpValid: false, backupCode: null });

    await expect(deps.useCase.execute(baseInput)).rejects.toMatchObject({
      code: 'MFA_CODE_INVALID',
    });
    expect(deps.mfaRepository.deleteFactor).not.toHaveBeenCalled();
  });

  it('rejects when the current password is wrong', async () => {
    const deps = buildUseCase({ passwordValid: false });

    await expect(deps.useCase.execute(baseInput)).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(deps.mfaRepository.deleteFactor).not.toHaveBeenCalled();
  });
});
