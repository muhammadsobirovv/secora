import { describe, expect, it, jest } from '@jest/globals';
import { LogoutUseCase } from './logout.use-case.js';
import type { SessionsRepository } from '../domain/repositories/sessions.repository.interface.js';
import type { RefreshTokensRepository } from '../domain/repositories/refresh-tokens.repository.interface.js';
import type { TokenService } from '../services/token.service.js';
import type { AuditService } from '../../audit/audit.service.js';
import type { RefreshToken } from '../../../prisma-types.js';

describe('LogoutUseCase', () => {
  const baseInput = {
    refreshToken: 'raw-refresh',
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
  };

  function buildUseCase(overrides?: { token?: RefreshToken | null }) {
    const sessionsRepository: jest.Mocked<SessionsRepository> = {
      create: jest.fn(),
      findById: jest.fn(),
      findActiveByUser: jest.fn(),
      touchLastActive: jest.fn(),
      revoke: jest.fn(),
      revokeAllForUser: jest.fn(),
    };
    const refreshTokensRepository: jest.Mocked<RefreshTokensRepository> = {
      create: jest.fn(),
      findByHash: jest
        .fn<RefreshTokensRepository['findByHash']>()
        .mockResolvedValue(
          overrides?.token === undefined
            ? ({
                id: 'token-1',
                userId: 'user-1',
                sessionId: 'session-1',
              } as RefreshToken)
            : overrides.token,
        ),
      markRotated: jest.fn(),
      revoke: jest.fn(),
      revokeAllForSession: jest.fn(),
    };
    const tokenService = {
      hashOpaqueToken: jest.fn().mockReturnValue('hashed'),
    } as unknown as jest.Mocked<TokenService>;
    const auditService = {
      log: jest.fn(),
    } as unknown as jest.Mocked<AuditService>;

    const useCase = new LogoutUseCase(
      sessionsRepository,
      refreshTokensRepository,
      tokenService,
      auditService,
    );
    return {
      useCase,
      sessionsRepository,
      refreshTokensRepository,
      auditService,
    };
  }

  it('revokes the session and its refresh tokens', async () => {
    const deps = buildUseCase();

    await deps.useCase.execute(baseInput);

    expect(
      deps.refreshTokensRepository.revokeAllForSession,
    ).toHaveBeenCalledWith('session-1');
    expect(deps.sessionsRepository.revoke).toHaveBeenCalledWith('session-1');
    expect(deps.auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'LOGOUT' }),
    );
  });

  it('is a no-op when the refresh token is already invalid', async () => {
    const deps = buildUseCase({ token: null });

    await deps.useCase.execute(baseInput);

    expect(deps.sessionsRepository.revoke).not.toHaveBeenCalled();
    expect(deps.auditService.log).not.toHaveBeenCalled();
  });
});
