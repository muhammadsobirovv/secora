import { describe, expect, it, jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { compileTransactionalTestingModule } from '../../../test-utils/transactional-testing-module.js';
import { RevokeSessionUseCase } from './revoke-session.use-case.js';
import {
  SESSIONS_REPOSITORY,
  type SessionsRepository,
} from '../domain/repositories/sessions.repository.interface.js';
import {
  REFRESH_TOKENS_REPOSITORY,
  type RefreshTokensRepository,
} from '../domain/repositories/refresh-tokens.repository.interface.js';
import { AuditService } from '../../audit/audit.service.js';
import type { Session } from '../../../prisma-types.js';

describe('RevokeSessionUseCase', () => {
  const baseInput = {
    sessionId: 'session-1',
    userId: 'user-1',
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
  };

  async function buildUseCase(overrides?: { session?: Session | null }) {
    const sessionsRepository: jest.Mocked<SessionsRepository> = {
      create: jest.fn(),
      findById: jest
        .fn<SessionsRepository['findById']>()
        .mockResolvedValue(
          overrides?.session === undefined
            ? ({ id: 'session-1', userId: 'user-1' } as Session)
            : overrides.session,
        ),
      findActiveByUser: jest.fn(),
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
    const auditService = {
      log: jest.fn(),
    } as unknown as jest.Mocked<AuditService>;

    const moduleRef = await compileTransactionalTestingModule([
      RevokeSessionUseCase,
      { provide: SESSIONS_REPOSITORY, useValue: sessionsRepository },
      { provide: REFRESH_TOKENS_REPOSITORY, useValue: refreshTokensRepository },
      { provide: AuditService, useValue: auditService },
    ]);
    const useCase = moduleRef.get(RevokeSessionUseCase);
    return {
      useCase,
      sessionsRepository,
      refreshTokensRepository,
      auditService,
    };
  }

  it('revokes the session and its refresh tokens', async () => {
    const deps = await buildUseCase();

    await deps.useCase.execute(baseInput);

    expect(
      deps.refreshTokensRepository.revokeAllForSession,
    ).toHaveBeenCalledWith('session-1');
    expect(deps.sessionsRepository.revoke).toHaveBeenCalledWith('session-1');
    expect(deps.auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SESSION_REVOKED' }),
    );
  });

  it('404s rather than confirming a session belongs to someone else', async () => {
    const deps = await buildUseCase({
      session: { id: 'session-1', userId: 'someone-else' } as Session,
    });

    await expect(deps.useCase.execute(baseInput)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(deps.sessionsRepository.revoke).not.toHaveBeenCalled();
  });

  it("404s when the session doesn't exist", async () => {
    const deps = await buildUseCase({ session: null });

    await expect(deps.useCase.execute(baseInput)).rejects.toBeInstanceOf(
      Not