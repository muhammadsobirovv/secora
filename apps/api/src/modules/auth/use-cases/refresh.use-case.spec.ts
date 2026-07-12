import { describe, expect, it, jest } from '@jest/globals';
import { RefreshUseCase } from './refresh.use-case.js';
import type { UsersRepository } from '../domain/repositories/users.repository.interface.js';
import type { SessionsRepository } from '../domain/repositories/sessions.repository.interface.js';
import type { RefreshTokensRepository } from '../domain/repositories/refresh-tokens.repository.interface.js';
import type { RbacService } from '../../rbac/rbac.service.js';
import type { TokenService } from '../services/token.service.js';
import type { AuditService } from '../../audit/audit.service.js';
import type { RefreshToken, User } from '../../../prisma-types.js';

describe('RefreshUseCase', () => {
  const baseInput = {
    refreshToken: 'raw-refresh',
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
  };
  const user = {
    id: 'user-1',
    email: 'user@example.com',
    status: 'ACTIVE',
  } as User;
  const validToken = {
    id: 'token-1',
    userId: 'user-1',
    sessionId: 'session-1',
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    replacedByTokenId: null,
  } as RefreshToken;

  function buildUseCase(overrides?: {
    token?: RefreshToken | null;
    rotationWon?: boolean;
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
    };
    const sessionsRepository: jest.Mocked<SessionsRepository> = {
      create: jest.fn(),
      findById: jest.fn(),
      findActiveByUser: jest.fn(),
      touchLastActive: jest.fn(),
      revoke: jest.fn(),
      revokeAllForUser: jest.fn(),
    };
    const refreshTokensRepository: jest.Mocked<RefreshTokensRepository> = {
      create: jest
        .fn<RefreshTokensRepository['create']>()
        .mockResolvedValue({ id: 'token-2' } as RefreshToken),
      findByHash: jest
        .fn<RefreshTokensRepository['findByHash']>()
        .mockResolvedValue(
          overrides?.token === undefined ? validToken : overrides.token,
        ),
      markRotated: jest.fn(),
      rotateIfActive: jest
        .fn<RefreshTokensRepository['rotateIfActive']>()
        .mockResolvedValue(overrides?.rotationWon ?? true),
      revoke: jest.fn(),
      revokeAllForSession: jest.fn(),
    };
    const rbacService = {
      getRoleNamesForUser: jest
        .fn<RbacService['getRoleNamesForUser']>()
        .mockResolvedValue(['USER']),
    } as unknown as jest.Mocked<RbacService>;
    const tokenService = {
      hashOpaqueToken: jest.fn().mockReturnValue('hashed'),
      generateOpaqueToken: jest.fn().mockReturnValue('raw-new-refresh'),
      getRefreshTokenExpiry: jest.fn().mockReturnValue(new Date()),
      signAccessToken: jest.fn().mockReturnValue('new-access-token'),
      getAccessTokenTtlSeconds: jest.fn().mockReturnValue(900),
    } as unknown as jest.Mocked<TokenService>;
    const auditService = {
      log: jest.fn(),
    } as unknown as jest.Mocked<AuditService>;

    const useCase = new RefreshUseCase(
      usersRepository,
      sessionsRepository,
      refreshTokensRepository,
      rbacService,
      tokenService,
      auditService,
    );

    return {
      useCase,
      usersRepository,
      sessionsRepository,
      refreshTokensRepository,
      auditService,
    };
  }

  it('rotates a valid token and returns new tokens', async () => {
    const deps = buildUseCase();

    const result = await deps.useCase.execute(baseInput);

    expect(deps.refreshTokensRepository.rotateIfActive).toHaveBeenCalledWith(
      'token-1',
      expect.any(String),
    );
    expect(deps.sessionsRepository.touchLastActive).toHaveBeenCalledWith(
      'session-1',
    );
    expect(result).toEqual({
      accessToken: 'new-access-token',
      refreshToken: 'raw-new-refresh',
      expiresIn: 900,
    });
    expect(deps.auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'REFRESH_TOKEN_ROTATED' }),
    );
  });

  it('rejects an unknown token', async () => {
    const deps = buildUseCase({ token: null });

    await expect(deps.useCase.execute(baseInput)).rejects.toMatchObject({
      code: 'INVALID_OR_EXPIRED_TOKEN',
    });
  });

  it('rejects an expired token', async () => {
    const deps = buildUseCase({
      token: { ...validToken, expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(deps.useCase.execute(baseInput)).rejects.toMatchObject({
      code: 'INVALID_OR_EXPIRED_TOKEN',
    });
  });

  it('nukes the whole session when an already-rotated token is reused', async () => {
    const deps = buildUseCase({
      token: {
        ...validToken,
        revokedAt: new Date(),
        replacedByTokenId: 'some-later-token',
      },
    });

    await expect(deps.useCase.execute(baseInput)).rejects.toMatchObject({
      code: 'INVALID_OR_EXPIRED_TOKEN',
    });
    expect(
      deps.refreshTokensRepository.revokeAllForSession,
    ).toHaveBeenCalledWith('session-1');
    expect(deps.sessionsRepository.revoke).toHaveBeenCalledWith('session-1');
    expect(deps.auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'REFRESH_TOKEN_REUSE_DETECTED' }),
    );
  });

  it('rejects a revoked-but-not-rotated token without escalating to reuse handling', async () => {
    const deps = buildUseCase({
      token: { ...validToken, revokedAt: new Date(), replacedByTokenId: null },
    });

    await expect(deps.useCase.execute(baseInput)).rejects.toMatchObject({
      code: 'INVALID_OR_EXPIRED_TOKEN',
    });
    expect(
      deps.refreshTokensRepository.revokeAllForSession,
    ).not.toHaveBeenCalled();
  });

  it('treats a lost rotation race (concurrent refresh) as reuse', async () => {
    const deps = buildUseCase({ rotationWon: false });

    await expect(deps.useCase.execute(baseInput)).rejects.toMatchObject({
      code: 'INVALID_OR_EXPIRED_TOKEN',
    });
    expect(
      deps.refreshTokensRepository.revokeAllForSession,
    ).toHaveBeenCalledWith('session-1');
    expect(deps.sessionsRepository.revoke).toHaveBeenCalledWith('session-1');
    expect(deps.auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'REFRESH_TOKEN_REUSE_DETECTED' }),
    );
  });

  it('rejects when the associated user is no longer active', async () => {
    const deps = buildUseCase();
    deps.usersRepository.findById.mockResolvedValue({
      ...user,
      status: 'SUSPENDED',
    });

    await expect(deps.useCase.execute(baseInput)).rejects.toMatchObject({
      code: 'INVALID_OR_EXPIRED_TOKEN',
    });
  });
});
