import { describe, expect, it, jest } from '@jest/globals';
import { OAuthExchangeUseCase } from './oauth-exchange.use-case.js';
import type { UsersRepository } from '../domain/repositories/users.repository.interface.js';
import type { OAuthExchangeCodesRepository } from '../domain/repositories/oauth-exchange-codes.repository.interface.js';
import type { MfaRepository } from '../domain/repositories/mfa.repository.interface.js';
import type { TokenService } from '../services/token.service.js';
import type { SessionIssuerService } from '../services/session-issuer.service.js';
import type { OAuthExchangeCode, User } from '../../../prisma-types.js';

describe('OAuthExchangeUseCase', () => {
  const baseInput = {
    code: 'raw-code',
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
  };
  const exchangeCode = {
    id: 'exchange-1',
    userId: 'user-1',
  } as OAuthExchangeCode;
  const activeUser = { id: 'user-1', status: 'ACTIVE' } as User;

  function buildUseCase(overrides?: {
    code?: OAuthExchangeCode | null;
    user?: User | null;
    mfaEnabled?: boolean;
  }) {
    const usersRepository: jest.Mocked<UsersRepository> = {
      findById: jest
        .fn<UsersRepository['findById']>()
        .mockResolvedValue(
          overrides?.user === undefined ? activeUser : overrides.user,
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
    const oauthExchangeCodesRepository: jest.Mocked<OAuthExchangeCodesRepository> =
      {
        create: jest.fn(),
        findValidByHash: jest
          .fn<OAuthExchangeCodesRepository['findValidByHash']>()
          .mockResolvedValue(
            overrides?.code === undefined ? exchangeCode : overrides.code,
          ),
        markUsed: jest.fn(),
      };
    const mfaRepository: jest.Mocked<MfaRepository> = {
      findFactorByUserId: jest
        .fn<MfaRepository['findFactorByUserId']>()
        .mockResolvedValue(
          overrides?.mfaEnabled ? ({ enabled: true } as never) : null,
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
    const tokenService = {
      hashOpaqueToken: jest.fn().mockReturnValue('hashed'),
      generateOpaqueToken: jest.fn().mockReturnValue('raw-challenge-token'),
    } as unknown as jest.Mocked<TokenService>;
    const sessionIssuer = {
      issue: jest.fn<SessionIssuerService['issue']>().mockResolvedValue({
        accessToken: 'a',
        refreshToken: 'r',
        expiresIn: 900,
      }),
    } as unknown as jest.Mocked<SessionIssuerService>;

    const useCase = new OAuthExchangeUseCase(
      usersRepository,
      oauthExchangeCodesRepository,
      mfaRepository,
      tokenService,
      sessionIssuer,
    );
    return { useCase, oauthExchangeCodesRepository, sessionIssuer };
  }

  it('issues tokens for a valid code when MFA is not enabled', async () => {
    const deps = buildUseCase();

    const result = await deps.useCase.execute(baseInput);

    expect(deps.oauthExchangeCodesRepository.markUsed).toHaveBeenCalledWith(
      'exchange-1',
    );
    expect(result).toEqual({
      accessToken: 'a',
      refreshToken: 'r',
      expiresIn: 900,
    });
  });

  it('returns an MFA challenge instead of tokens for a hybrid OAuth+MFA account', async () => {
    const deps = buildUseCase({ mfaEnabled: true });

    const result = await deps.useCase.execute(baseInput);

    expect(result).toEqual({
      mfaRequired: true,
      mfaChallengeToken: 'raw-challenge-token',
    });
    expect(deps.sessionIssuer.issue).not.toHaveBeenCalled();
  });

  it('rejects an invalid or expired exchange code', async () => {
    const deps = buildUseCase({ code: null });

    await expect(deps.useCase.execute(baseInput)).rejects.toMatchObject({
      code: 'INVALID_OR_EXPIRED_TOKEN',
    });
  });

  it('rejects when the associated user is no longer active', async () => {
    const deps = buildUseCase({ user: { ...activeUser, status: 'SUSPENDED' } });

    await expect(deps.useCase.execute(baseInput)).rejects.toMatchObject({
      code: 'INVALID_OR_EXPIRED_TOKEN',
    });
  });
});
