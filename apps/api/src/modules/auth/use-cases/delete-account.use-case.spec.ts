import { describe, expect, it, jest } from '@jest/globals';
import { compileTransactionalTestingModule } from '../../../test-utils/transactional-testing-module.js';
import { DeleteAccountUseCase } from './delete-account.use-case.js';
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

describe('DeleteAccountUseCase', () => {
  const baseInput = {
    currentPassword: 'correct-horse-battery',
    userId: 'user-1',
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
  };
  const user = { id: 'user-1', passwordHash: 'old-hash' } as User;
  const activeSessions = [
    { id: 'session-1' } as Session,
    { id: 'session-2' } as Session,
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
      markDeleted: jest.fn(),
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
      hash: jest.fn(),
      verify: jest
        .fn<PasswordHasherService['verify']>()
        .mockResolvedValue(overrides?.passwordValid ?? true),
    } as unknown as jest.Mocked<PasswordHasherService>;
    const auditService = {
      log: jest.fn(),
    } as unknown as jest.Mocked<AuditService>;

    const moduleRef = await compileTransactionalTestingModule([
      DeleteAccountUseCase,
      { provide: USERS_REPOSITORY, useValue: usersRepository },
      { provide: SESSIONS_REPOSITORY, useValue: sessionsRepository },
      { provide: REFRESH_TOKENS_REPOSITORY, useValue: refreshTokensRepository },
      { provide: PasswordHasherService, useValue: passwordHasher },
      { provide: AuditService, useValue: auditService },
    ]);
    const useCase = moduleRef.get(DeleteAccountUseCase);
    return {
      useCase,
      usersRepository,
      sessionsRepository,
      refreshTokensRepository,
      auditService,
    };
  }

  it('revokes every session and refresh token, marks the account deleted, and logs it', async () => {
    const deps = await buildUseCase();

    await deps.useCase.execute(baseInput);

    expect(deps.refreshTokensRepository.revokeAllForSession).toHaveBeenCalledTimes(2);
    expect(deps.refreshTokensRepository.revokeAllForSession).toHaveBeenCalledWith('session-1');
    expect(deps.refreshTokensRepository.revokeAllForSession).toHaveBeenCalledWith('session-2');
    expect(deps.sessionsRepository.revokeAllForUser).toHaveBeenCalledWith('user-1');
    expect(deps.usersRepository.markDeleted).toHaveBeenCalledWith('user-1');
    expect(deps.auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ACCOUNT_DELETION_REQUESTED' }),
    );
  });

  it('rejects when the current password is wrong', async () => {
    const deps = await buildUseCase({ passwordValid: false });

    await expect(deps.useCase.execute(baseInput)).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(deps.usersRepository.markDeleted).not.toHaveBeenCalled();
    expect(deps.sessionsRepository.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('rejects when the account has no password set (OAuth-only account)', async () => {
    const deps = await buildUseCase({ user: { id: 'user-1' } as User });

    await expect(deps.useCase.execute(baseInput)).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(deps.usersRepository.markDeleted).not.toHaveBeenCalled();
  });
});
