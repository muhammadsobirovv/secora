import { describe, expect, it, jest } from '@jest/globals';
import { LoginUseCase } from './login.use-case.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import type { UsersRepository } from '../domain/repositories/users.repository.interface.js';
import type { MfaRepository } from '../domain/repositories/mfa.repository.interface.js';
import type { PasswordHasherService } from '../services/password-hasher.service.js';
import type { TokenService } from '../services/token.service.js';
import type { SessionIssuerService } from '../services/session-issuer.service.js';
import type { AuditService } from '../../audit/audit.service.js';
import type { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../../config/env.validation.js';
import type { User } from '../../../prisma-types.js';

describe('LoginUseCase', () => {
  const baseInput = {
    email: 'user@example.com',
    password: 'correct-password',
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
  };
  const activeUser: User = {
    id: 'user-1',
    email: baseInput.email,
    passwordHash: 'hashed',
    status: 'ACTIVE',
    failedLoginCount: 0,
    lockedUntil: null,
  } as User;

  function buildUseCase(overrides?: {
    user?: User | null;
    mfaEnabled?: boolean;
    passwordValid?: boolean;
  }) {
    const usersRepository: jest.Mocked<UsersRepository> = {
      findById: jest.fn(),
      findByEmail: jest
        .fn<UsersRepository['findByEmail']>()
        .mockResolvedValue(
          overrides?.user === undefined ? activeUser : overrides.user,
        ),
      create: jest.fn(),
      updatePasswordHash: jest.fn(),
      setEmailVerified: jest.fn(),
      recordFailedLogin: jest
        .fn<UsersRepository['recordFailedLogin']>()
        .mockResolvedValue({
          ...activeUser,
          failedLoginCount: 1,
        }),
      resetFailedLogin: jest.fn(),
      lockUntil: jest.fn(),
      markDeleted: jest.fn(),
    };
    const mfaRepository: jest.Mocked<MfaRepository> = {
      findFactorByUserId: jest
        .fn<MfaRepository['findFactorByUserId']>()
        .mockResolvedValue(
          overrides?.mfaEnabled
            ? ({ enabled: true, secret: 's' } as never)
            : null,
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
    const passwordHasher = {
      hash: jest.fn(),
      verify: jest
        .fn<PasswordHasherService['verify']>()
        .mockResolvedValue(overrides?.passwordValid ?? true),
    } as unknown as jest.Mocked<PasswordHasherService>;
    const tokenService = {
      generateOpaqueToken: jest.fn().mockReturnValue('raw-challenge-token'),
      hashOpaqueToken: jest.fn().mockReturnValue('hashed-challenge-token'),
    } as unknown as jest.Mocked<TokenService>;
    const sessionIssuer = {
      issue: jest.fn<SessionIssuerService['issue']>().mockResolvedValue({
        accessToken: 'a',
        refreshToken: 'r',
        expiresIn: 900,
      }),
    } as unknown as jest.Mocked<SessionIssuerService>;
    const auditService = {
      log: jest.fn(),
    } as unknown as jest.Mocked<AuditService>;
    const configService = {
      get: jest.fn((key: string) =>
        key === 'ACCOUNT_LOCKOUT_MAX_ATTEMPTS' ? 5 : 15,
      ),
    } as unknown as jest.Mocked<ConfigService<EnvConfig, true>>;

    const useCase = new LoginUseCase(
      usersRepository,
      mfaRepository,
      passwordHasher,
      tokenService,
      sessionIssuer,
      auditService,
      configService,
    );

    return {
      useCase,
      usersRepository,
      mfaRepository,
      passwordHasher,
      sessionIssuer,
      auditService,
    };
  }

  it('issues tokens directly when MFA is not enabled', async () => {
    const deps = buildUseCase();

    const result = await deps.useCase.execute(baseInput);

    expect(deps.sessionIssuer.issue).toHaveBeenCalledWith(
      activeUser,
      expect.objectContaining({ ipAddress: '127.0.0.1' }),
    );
    expect(result).toEqual({
      accessToken: 'a',
      refreshToken: 'r',
      expiresIn: 900,
    });
    expect(deps.auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'LOGIN_SUCCESS' }),
    );
  });

  it('returns an MFA challenge instead of tokens when MFA is enabled', async () => {
    const deps = buildUseCase({ mfaEnabled: true });

    const result = await deps.useCase.execute(baseInput);

    expect(result).toEqual({
      mfaRequired: true,
      mfaChallengeToken: 'raw-challenge-token',
    });
    expect(deps.sessionIssuer.issue).not.toHaveBeenCalled();
  });

  it('rejects a nonexistent user with the same error as a wrong password', async () => {
    const deps = buildUseCase({ user: null });

    await expect(deps.useCase.execute(baseInput)).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('rejects a suspended account', async () => {
    const deps = buildUseCase({ user: { ...activeUser, status: 'SUSPENDED' } });

    await expect(deps.useCase.execute(baseInput)).rejects.toMatchObject({
      code: 'ACCOUNT_SUSPENDED',
    });
  });

  it('rejects a locked account without checking the password', async () => {
    const deps = buildUseCase({
      user: { ...activeUser, lockedUntil: new Date(Date.now() + 60_000) },
    });

    await expect(deps.useCase.execute(baseInput)).rejects.toMatchObject({
      code: 'ACCOUNT_LOCKED',
    });
    expect(deps.passwordHasher.verify).not.toHaveBeenCalled();
  });

  it('locks the account after reaching the max failed-attempt threshold', async () => {
    const deps = buildUseCase({ passwordValid: false });
    deps.usersRepository.recordFailedLogin.mockResolvedValue({
      ...activeUser,
      failedLoginCount: 5,
    });

    await expect(deps.useCase.execute(baseInput)).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(deps.usersRepository.lockUntil).toHaveBeenCalledWith(
      'user-1',
      expect.any(Date),
    );
    expect(deps.auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ACCOUNT_LOCKED' }),
    );
  });

  it('does not lock the account below the failed-attempt threshold', async () => {
    const deps = buildUseCase({ passwordValid: false });
    deps.usersRepository.recordFailedLogin.mockResolvedValue({
      ...activeUser,
      failedLoginCount: 2,
    });

    await expect(deps.useCase.execute(baseInput)).rejects.toBeInstanceOf(
      AppException,
    );
    expect(deps.usersRepository.lockUntil).not.toHaveBeenCalled();
  });

  it('rejects an OAuth-only account (no password set)', async () => {
    const deps = buildUseCase({ user: { ...activeUser, passwordHash: null } });

    await expect(deps.useCase.execute(baseInput)).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(deps.passwordHasher.verify).not.toHaveBeenCalled();
  });
});
