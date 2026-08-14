import { describe, expect, it, jest } from '@jest/globals';
import { MfaChallengeUseCase } from './mfa-challenge.use-case.js';
import type { UsersRepository } from '../domain/repositories/users.repository.interface.js';
import type { MfaRepository } from '../domain/repositories/mfa.repository.interface.js';
import type { TokenService } from '../services/token.service.js';
import type { TotpService } from '../services/totp.service.js';
import type { SessionIssuerService } from '../services/session-issuer.service.js';
import type { AuditService } from '../../audit/audit.service.js';
import type {
  User,
  MfaChallengeToken,
  MfaFactor,
} from '../../../prisma-types.js';

describe('MfaChallengeUseCase', () => {
  const baseInput = {
    mfaChallengeToken: 'raw-token',
    code: '123456',
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
  };
  const user = { id: 'user-1', email: 'user@example.com' } as User;
  const factor = {
    id: 'factor-1',
    secret: 'SECRET',
    enabled: true,
  } as MfaFactor;
  const challengeToken = {
    id: 'challenge-1',
    userId: 'user-1',
  } as MfaChallengeToken;

  function buildUseCase(overrides?: {
    totpValid?: boolean;
    backupCode?: unknown;
  }) {
    const usersRepository: jest.Mocked<UsersRepository> = {
      findById: jest.fn<UsersRepository['findById']>().mockResolvedValue(user),
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
        .mockResolvedValue(factor),
      createFactor: jest.fn(),
      confirmFactor: jest.fn(),
      deleteFactor: jest.fn(),
      replaceBackupCodes: jest.fn(),
      findUnusedBackupCodeByHash: jest
        .fn<MfaRepository['findUnusedBackupCodeByHash']>()
        .mockResolvedValue((overrides?.backupCode ?? null) as never),
      consumeBackupCode: jest.fn(),
      createChallengeToken: jest.fn(),
      findValidChallengeTokenByHash: jest
        .fn<MfaRepository['findValidChallengeTokenByHash']>()
        .mockResolvedValue(challengeToken),
      consumeChallengeToken: jest.fn(),
    };
    const tokenService = {
      hashOpaqueToken: jest.fn().mockReturnValue('hashed'),
    } as unknown as jest.Mocked<TokenService>;
    const totpService = {
      verifyCode: jest
        .fn<TotpService['verifyCode']>()
        .mockResolvedValue(overrides?.totpValid ?? true),
    } as unknown as jest.Mocked<TotpService>;
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

    const useCase = new MfaChallengeUseCase(
      usersRepository,
      mfaRepository,
      tokenService,
      totpService,
      sessionIssuer,
      auditService,
    );

    return {
      useCase,
      usersRepository,
      mfaRepository,
      totpService,
      sessionIssuer,
      auditService,
    };
  }

  it('issues tokens on a valid TOTP code and consumes the challenge token', async () => {
    const deps = buildUseCase({ totpValid: true });

    const result = await deps.useCase.execute(baseInput);

    expect(deps.mfaRepository.consumeChallengeToken).toHaveBeenCalledWith(
      'challenge-1',
    );
    expect(deps.sessionIssuer.issue).toHaveBeenCalledWith(
      user,
      expect.anything(),
    );
    expect(result).toEqual({
      accessToken: 'a',
      refreshToken: 'r',
      expiresIn: 900,
    });
    expect(deps.auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'MFA_CHALLENGE_SUCCESS' }),
    );
  });

  it('falls back to a valid backup code when the TOTP code is wrong', async () => {
    const deps = buildUseCase({
      totpValid: false,
      backupCode: { id: 'backup-1' },
    });

    const result = await deps.useCase.execute(baseInput);

    expect(deps.mfaRepository.consumeBackupCode).toHaveBeenCalledWith(
      'backup-1',
    );
    expect(result).toEqual({
      accessToken: 'a',
      refreshToken: 'r',
      expiresIn: 900,
    });
  });

  it('rejects when neither the TOTP code nor a backup code matches', async () => {
    const deps = buildUseCase({ totpValid: false, backupCode: null });

    await expect(deps.useCase.execute(baseInput)).rejects.toMatchObject({
      code: 'MFA_CODE_INVALID',
    });
    expect(deps.auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'MFA_CHALLENGE_FAILURE' }),
    );
    expect(deps.sessionIssuer.issue).not.toHaveBeenCalled();
  });

  it('rejects an expired or unknown challenge token', async () => {
    const deps = buildUseCase();
    deps.mfaRepository.findValidChallengeTokenByHash.mockResolvedValue(null);

    await expect(deps.useCase.execute(baseInput)).rejects.toMatchObject({
      code: 'MFA_CHALLENGE_EXPIRED',
    });
  });

  it("rejects when the user's MFA factor is missing or disabled", async () => {
    const deps = buildUseCase();
    deps.mfaRepository.findFactorByUserId.mockResolvedValue(null);

    await expect(deps.useCase.execute(baseInput)).rejects.toMatchObject({
      code: 'MFA_NOT_ENABLED',
    });
  });
});
