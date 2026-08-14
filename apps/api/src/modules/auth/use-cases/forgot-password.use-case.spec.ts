import { describe, expect, it, jest } from '@jest/globals';
import { ForgotPasswordUseCase } from './forgot-password.use-case.js';
import type { UsersRepository } from '../domain/repositories/users.repository.interface.js';
import type { PasswordResetTokensRepository } from '../domain/repositories/password-reset-tokens.repository.interface.js';
import type { MailService } from '../../../common/providers/mail/mail-service.interface.js';
import type { TokenService } from '../services/token.service.js';
import type { AuditService } from '../../audit/audit.service.js';
import type { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../../config/env.validation.js';
import type { User } from '../../../prisma-types.js';

describe('ForgotPasswordUseCase', () => {
  const baseInput = {
    email: 'user@example.com',
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
  };

  function buildUseCase(overrides?: { user?: User | null }) {
    const usersRepository: jest.Mocked<UsersRepository> = {
      findById: jest.fn(),
      findByEmail: jest
        .fn<UsersRepository['findByEmail']>()
        .mockResolvedValue(
          overrides?.user === undefined
            ? ({ id: 'user-1', email: baseInput.email } as User)
            : overrides.user,
        ),
      create: jest.fn(),
      updatePasswordHash: jest.fn(),
      setEmailVerified: jest.fn(),
      recordFailedLogin: jest.fn(),
      resetFailedLogin: jest.fn(),
      lockUntil: jest.fn(),
      markDeleted: jest.fn(),
    };
    const passwordResetTokensRepository: jest.Mocked<PasswordResetTokensRepository> =
      {
        create: jest.fn(),
        findValidByHash: jest.fn(),
        markUsed: jest.fn(),
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

    const useCase = new ForgotPasswordUseCase(
      usersRepository,
      passwordResetTokensRepository,
      mailService,
      tokenService,
      auditService,
      configService,
    );
    return {
      useCase,
      passwordResetTokensRepository,
      mailService,
      auditService,
    };
  }

  it('creates a reset token and sends an email when the user exists', async () => {
    const deps = buildUseCase();

    await deps.useCase.execute(baseInput);

    expect(deps.passwordResetTokensRepository.create).toHaveBeenCalledWith(
      'user-1',
      'hashed',
      expect.any(Date),
    );
    expect(deps.mailService.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: baseInput.email }),
    );
    expect(deps.auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PASSWORD_RESET_REQUESTED' }),
    );
  });

  it("silently no-ops when the email doesn't belong to any account", async () => {
    const deps = buildUseCase({ user: null });

    await deps.useCase.execute(baseInput);

    expect(deps.passwordResetTokensRepository.create).not.toHaveBeenCalled();
    expect(deps.mailService.send).not.toHaveBeenCalled();
  });
});
