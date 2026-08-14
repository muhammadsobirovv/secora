import { describe, expect, it, jest } from '@jest/globals';
import { ResendVerificationEmailUseCase } from './resend-verification-email.use-case.js';
import type { UsersRepository } from '../domain/repositories/users.repository.interface.js';
import type { EmailVerificationTokensRepository } from '../domain/repositories/email-verification-tokens.repository.interface.js';
import type { MailService } from '../../../common/providers/mail/mail-service.interface.js';
import type { TokenService } from '../services/token.service.js';
import type { AuditService } from '../../audit/audit.service.js';
import type { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../../config/env.validation.js';
import type { User } from '../../../prisma-types.js';

describe('ResendVerificationEmailUseCase', () => {
  const baseInput = {
    email: 'user@example.com',
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
  };
  const unverifiedUser = {
    id: 'user-1',
    email: baseInput.email,
    emailVerified: false,
  } as User;

  function buildUseCase(overrides?: { user?: User | null }) {
    const usersRepository: jest.Mocked<UsersRepository> = {
      findById: jest.fn(),
      findByEmail: jest
        .fn<UsersRepository['findByEmail']>()
        .mockResolvedValue(
          overrides?.user === undefined ? unverifiedUser : overrides.user,
        ),
      create: jest.fn(),
      updatePasswordHash: jest.fn(),
      setEmailVerified: jest.fn(),
      recordFailedLogin: jest.fn(),
      resetFailedLogin: jest.fn(),
      lockUntil: jest.fn(),
      markDeleted: jest.fn(),
    };
    const emailVerificationTokensRepository: jest.Mocked<EmailVerificationTokensRepository> =
      {
        create: jest.fn(),
        findValidByHash: jest.fn(),
        markUsed: jest.fn(),
        invalidateAllForUser: jest.fn(),
      };
    const mailService: jest.Mocked<MailService> = { send: jest.fn() };
    const tokenService = {
      generateOpaqueToken: jest.fn().mockReturnValue('raw-token'),
      hashOpaqueToken: jest.fn().mockReturnValue('hashed'),
    } as unknown as jest.Mocked<TokenService>;
    const auditService = {
      log: jest.fn(),
    } as unknown as jest.Mocked<AuditService>;
    const configService = {
      get: jest.fn().mockReturnValue('http://localhost:3001'),
    } as unknown as jest.Mocked<ConfigService<EnvConfig, true>>;

    const useCase = new ResendVerificationEmailUseCase(
      usersRepository,
      emailVerificationTokensRepository,
      mailService,
      tokenService,
      auditService,
      configService,
    );
    return {
      useCase,
      emailVerificationTokensRepository,
      mailService,
      auditService,
    };
  }

  it('invalidates old tokens, issues a new one, and sends a fresh email', async () => {
    const deps = buildUseCase();

    await deps.useCase.execute(baseInput);

    expect(
      deps.emailVerificationTokensRepository.invalidateAllForUser,
    ).toHaveBeenCalledWith('user-1');
    expect(deps.emailVerificationTokensRepository.create).toHaveBeenCalledWith(
      'user-1',
      'hashed',
      expect.any(Date),
    );
    expect(deps.mailService.send).toHaveBeenCalled();
    expect(deps.auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'VERIFICATION_EMAIL_RESENT' }),
    );
  });

  it("no-ops when the account doesn't exist", async () => {
    const deps = buildUseCase({ user: null });

    await deps.useCase.execute(baseInput);

    expect(deps.mailService.send).not.toHaveBeenCalled();
  });

  it('no-ops when the email is already verified', async () => {
    const deps = buildUseCase({
      user: { ...unverifiedUser, emailVerified: true },
    });

    await deps.useCase.execute(baseInput);

    expect(deps.mailService.send).not.toHaveBeenCalled();
  });
});
