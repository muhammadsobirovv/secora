import { describe, expect, it, jest } from '@jest/globals';
import { compileTransactionalTestingModule } from '../../../test-utils/transactional-testing-module.js';
import { ResetPasswordUseCase } from './reset-password.use-case.js';
import {
  USERS_REPOSITORY,
  type UsersRepository,
} from '../domain/repositories/users.repository.interface.js';
import {
  PASSWORD_RESET_TOKENS_REPOSITORY,
  type PasswordResetTokensRepository,
} from '../domain/repositories/password-reset-tokens.repository.interface.js';
import {
  SESSIONS_REPOSITORY,
  type SessionsRepository,
} from '../domain/repositories/sessions.repository.interface.js';
import {
  REFRESH_TOKENS_REPOSITORY,
  type RefreshTokensRepository,
} from '../domain/repositories/refresh-tokens.repository.interface.js';
import { PasswordHasherService } from '../services/password-hasher.service.js';
import { TokenService } from '../services/token.service.js';
import { AuditService } from '../../audit/audit.service.js';
import type { PasswordResetToken, Session } from '../../../prisma-types.js';

describe('ResetPasswordUseCase', () => {
  const baseInput = {
    token: 'raw-token',
    newPassword: 'new-correct-horse-battery',
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
  };
  const resetToken = { id: 'reset-1', userId: 'user-1' } as PasswordResetToken;
  const activeSessions = [
    { id: 'session-1' } as Session,
    { id: 'session-2' } as Session,
  ];

  async function buildUseCase(overrides?: {
    token?: PasswordResetToken | null;
  }) {
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
    const passwordResetTokensRepository: jest.Mocked<PasswordResetTokensRepository> =
      {
        create: jest.fn(),
        findValidByHash: jest
          .fn<PasswordResetTokensRepository['findValidByHash']>()
          .mockResolvedValue(
            overrides?.token === undefined ? resetToken : overrides.token,
          ),
        markUsed: jest.fn(),
      };
    const sessionsRepository: jest.Mocked<SessionsRepository> = {
      create: jest.fn(),
      findById: jest.fn(),
      findActiveByUser: jest
        .fn<SessionsRepository['findActiveByUser']>()
        .mockResolvedValue(activeSessions),
      touchLastActive: jest.fn(),
      revoke: jest.fn(),
      revokeAllForUser: jest.fn(),
    };
    const refreshTokensRepository: jest.Mocked<RefreshTokensRepository> = {
      create: jest.fn(),
      findByHash: jest.fn(),
      markRotated: jest.fn(),
      rotateIfActive: jest.fn(),
      revoke: jest.fn(),
      revokeAllForSession: jest.fn(),
    };
    const passwordHasher = {
      hash: jest
        .fn<PasswordHasherService['hash']>()
        .mockResolvedValue('new-hash'),
      verify: jest.fn(),
    } as unknown as jest.Mocked<PasswordHasherService>;
    const tokenService = {
      hashOpaqueToken: jest.fn().mockReturnValue('hashed'),
    } as unknown as jest.Mocked<TokenService>;
    const auditService = {
      log: jest.fn(),
    } as unknown as jest.Mocked<AuditService>;

    const moduleRef = await compileTransactionalTestingModule([
      ResetPasswordUseCase,
      { provide: USERS_REPOSITORY, useValue: usersRepository },
      {
        provide: PASSWORD_RESET_TOKENS_REPOSITORY,
        useValue: passwordResetTokensRepository,
      },
      { provide: SESSIONS_REPOSITORY, useValue: sessionsRepository },
      { provide: REFRESH_TOKENS_REPOSITORY, useValue: refreshTokensRepository },
      { provide: PasswordHasherService, useValue: passwordHasher },
      { provide: TokenService, useValue: tokenService },
      { provide: AuditService, useValue: auditService },
    ]);
    const useCase = moduleRef.get(ResetPasswordUseCase);
    return {
      useCase,
      usersRepository,
      passwordResetTokensRepository,
      sessionsRepository,
      refreshTokensRepository,
      auditService,
    };
  }

  it("sets the new password and revokes every session's refresh tokens before revoking the sessions", async () => {
    const deps = await buildUseCase();
    const callOrder: string[] = [];
    deps.refreshTokensRepository.revokeAllForSession.mockImplementation(() => {
      callOrder.push('revokeAllForSession');
      return Promise.resolve();
    });
    deps.sessionsRepository.revokeAllForUser.mockImplementation(() => {
      callOrder.push('revokeAllForUser');
      return Promise.resolve();
    });

    await deps.useCase.execute(baseInput);

    expect(deps.usersRepository.updatePasswordHash).toHaveBeenCalledWith(
      'user-1',
      'new-hash',
    );
    expect(deps.passwordResetTokensRepository.markUsed).toHaveBeenCalledWith(
      'reset-1',
    );
    // Regression guard: refresh tokens must be revoked while the session
    // query still finds them active — revoking sessions first would make
    // findActiveByUser return empty and leave refresh tokens live.
    expect(
      deps.refreshTokensRepository.revokeAllForSession,
    ).toHaveBeenCalledTimes(2);
    expect(callOrder).toEqual([
      'revokeAllForSession',
      'revokeAllForSession',
      'revokeAllForUser',
    ]);
    expect(deps.auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PASSWORD_RESET_COMPLETED' }),
    );
  });

  it('rejects an invalid or expired reset token', async () => {
    const deps = await buildUseCase({ token: null });

    await expect(deps.useCase.execute(baseInput)).rejects.toMatchObject({
      code: 'INVALID_OR_EXPIRED_TOKEN',
    });
    expect(deps.usersRepository.updatePasswordHash).n