import { describe, expect, it, jest } from '@jest/globals';
import { VerifyEmailUseCase } from './verify-email.use-case.js';
import type { UsersRepository } from '../domain/repositories/users.repository.interface.js';
import type { EmailVerificationTokensRepository } from '../domain/repositories/email-verification-tokens.repository.interface.js';
import type { TokenService } from '../services/token.service.js';
import type { AuditService } from '../../audit/audit.service.js';
import type { EmailVerificationToken } from '../../../prisma-types.js';

describe('VerifyEmailUseCase', () => {
  const baseInput = {
    token: 'raw-token',
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
  };
  const verificationToken = {
    id: 'vtoken-1',
    userId: 'user-1',
  } as EmailVerificationToken;

  function buildUseCase(overrides?: { token?: EmailVerificationToken | null }) {
    const usersRepository: jest.Mocked<UsersRepository> = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      create: jest.fn(),
      updatePasswordHash: jest.fn(),
      setEmailVerified: jest.fn(),
      recordFailedLogin: jest.fn(),
      resetFailedLogin: jest.fn(),
      lockUntil: jest.fn(),
    };
    const emailVerificationTokensRepository: jest.Mocked<EmailVerificationTokensRepository> =
      {
        create: jest.fn(),
        findValidByHash: jest
          .fn<EmailVerificationTokensRepository['findValidByHash']>()
          .mockResolvedValue(
            overrides?.token === undefined
              ? verificationToken
              : overrides.token,
          ),
        markUsed: jest.fn(),
        invalidateAllForUser: jest.fn(),
      };
    const tokenService = {
      hashOpaqueToken: jest.fn().mockReturnValue('hashed'),
    } as unknown as jest.Mocked<TokenService>;
    const auditService = {
      log: jest.fn(),
    } as unknown as jest.Mocked<AuditService>;

    const useCase = new VerifyEmailUseCase(
      usersRepository,
      emailVerificationTokensRepository,
      tokenService,
      auditService,
    );
    return {
      useCase,
      usersRepository,
      emailVerificationTokensRepository,
      auditService,
    };
  }

  it("marks the user's email verified and the token used", async () => {
    const deps = buildUseCase();

    await deps.useCase.execute(baseInput);

    expect(deps.usersRepository.setEmailVerified).toHaveBeenCalledWith(
      'user-1',
    );
    expect(
      deps.emailVerificationTokensRepository.markUsed,
    ).toHaveBeenCalledWith('vtoken-1');
    expect(deps.auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'EMAIL_VERIFIED' }),
    );
  });

  it('rejects an invalid or expired token', async () => {
    const deps = buildUseCase({ token: null });

    await expect(deps.useCase.execute(baseInput)).rejects.toMatchObject({
      code: 'INVALID_OR_EXPIRED_TOKEN',
    });
    expect(deps.usersRepository.setEmailVerified).not.toHaveBeenCalled();
  });
});
