import { describe, expect, it, jest } from '@jest/globals';
import { ListSessionsUseCase } from './list-sessions.use-case.js';
import type { SessionsRepository } from '../domain/repositories/sessions.repository.interface.js';
import type { Session } from '../../../prisma-types.js';

describe('ListSessionsUseCase', () => {
  it('marks the session matching the current sessionId as current', async () => {
    const sessions = [
      {
        id: 'session-a',
        deviceName: 'Chrome on macOS',
        ipAddress: '1.1.1.1',
        userAgent: 'ua-a',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        lastActiveAt: new Date('2026-01-02T00:00:00Z'),
      },
      {
        id: 'session-b',
        deviceName: 'Firefox on Linux',
        ipAddress: '2.2.2.2',
        userAgent: 'ua-b',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        lastActiveAt: new Date('2026-01-02T00:00:00Z'),
      },
    ] as Session[];
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
    const useCase = new ListSessionsUseCase(sessionsRepository);

    const result = await useCase.execute('user-1', 'session-b');

    expect(result).toHaveLength(2);
    expect(result.find((s) => s.id === 'session-a')?.current).toBe(false);
    expect(result.find((s) => s.id === 'session-b')?.current).toBe(true);
  });
});
