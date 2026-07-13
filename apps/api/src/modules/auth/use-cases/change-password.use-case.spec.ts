import { describe, expect, it, jest } from '@jest/globals';
import { compileTransactionalTestingModule } from '../../../test-utils/transactional-testing-module.js';
import { ChangePasswordUseCase } from './change-password.use-case.js';
import {
  USERS_REPOSITORY,
  type UsersRepository,
} from '../domain/repositories/users.repository.interface.js';
import {
  SESSIONS_REPOSITORY,
  type SessionsRepository,
} from '../domain/repositories/sessions.repository.interface.js';
import {
  REFRESH_TOKENS_REPOSITORY,
  type RefreshTokensRepository,
} from '../domain/repositories/refresh-tokens.repository.interface.js';
import { PasswordHasherService } from '../services/password-hasher.service.js';
import { AuditService } from '../../audit/audit.service.js';
import type { Session, User } from '../../../prisma-types.js';

describe('ChangePasswordUseCase', () => {
  const baseInput = {
    currentPassword: 'old-password',
    newPassword: 'new-correct-horse-battery',
    userId: 'user-1',
    currentSessionId: 'session-current',
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
  };
  const user = { id: 'user-1', passwordHash: 'old-hash' } as User;
  const sessions = [
    { id: 'session-current' } as Session,
    { id: 'session-other' } as Session,
  ];

  async function buildUseCase(overrides?: {
    user?: User | null;
    passwordValid?: boolean;
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
    const sessionsRepository: jest.Mocked<SessionsRepository> = {
      create: jest.fn(),
      findById: jest.fn(),
      findActiveByUser: jest
        .fn<SessionsRepository['findActiveByUser']>()
        .mockResolvedValue(sessions),
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
      verify: jest
        .fn<PasswordHasherService['verify']>()
        .mockResolvedValue(overrides?.passwordValid ?? true),
    } as unknown as jest.Mocked<PasswordHasherService>;
    const auditService = {
      log: jest.fn(),
    } as unknown as jest.Mocked<AuditService>;

    const moduleRef = await compileTransactionalTestingModule([
      ChangePasswordUseCase,
      { provide: USERS_REPOSITORY, useValue: usersRepository },
      { provide: SESSIONS_REPOSITORY, useValue: sessionsRepository },
      { provide: REFRESH_TOKENS_REPOSITORY, useValue: refreshTokensRepository },
      { provide: PasswordHasherService, useValue: passwordHasher },
      { provide: AuditService, useValue: auditService },
    ]);
    const useCase = moduleRef.get(ChangePasswordUseCase);
    return {
      useCase,
      usersRepository,
      sessionsRepository,
      refreshTokensRepository,
      auditService,
    };
  }

  it('changes the password and revokes every other session but keeps the current one', async () => {
    const deps = await buildUseCase();

    await deps.useCase.execute(baseInput);

    expect(deps.usersRepository.updatePasswordHash).toHaveBeenCalledWith(
      'user-1',
      'new-hash',
    );
    expect(
      deps.refreshTokensRepository.revokeAllForSession,
    ).toHaveBeenCalledWith('session-other');
    expect(
      deps.refreshTokensRepository.revokeAllForSession,
    ).not.toHaveBeenCalledWith('session-current');
    expect(deps.sessionsRepository.revokeAllForUser).toHaveBeenCalledWith(
      'user-1',
      'session-current',
    );
    expect(deps.auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PASSWORD_CHANGED' }),
    );
  });

  it('rejects when the current password is wrong', async () => {
    const deps = await buildUseCase({ passwordValid: false });

    await expect(deps.useCase.execute(baseInput)).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(deps.usersRepository.updatePasswordHash).not.toHaveBeenCalled();
  });

  it('rejects an OAuth-only account with no password to check against', async () => {
    const deps = await buildUseCase({ user: { ...user, passwordHash: null } });

    await expect(deps.useCase.execute(baseInput)).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });
});
