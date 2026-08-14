import { describe, expect, it, jest } from '@jest/globals';
import { ExportUserDataUseCase } from './export-user-data.use-case.js';
import type { UsersRepository } from '../domain/repositories/users.repository.interface.js';
import type { SessionsRepository } from '../domain/repositories/sessions.repository.interface.js';
import type { OAuthAccountsRepository } from '../domain/repositories/oauth-accounts.repository.interface.js';
import type { UserPreferencesRepository } from '../../user-preferences/domain/repositories/user-preferences.repository.interface.js';
import type { AuditService } from '../../audit/audit.service.js';
import type {
  AuditEvent,
  OAuthAccount,
  Session,
  User,
  UserPreferences,
} from '../../../prisma-types.js';

describe('ExportUserDataUseCase', () => {
  const baseInput = {
    userId: 'user-1',
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
  };
  const user = {
    id: 'user-1',
    email: 'user@example.com',
    displayName: 'Test User',
    emailVerified: true,
    status: 'ACTIVE',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  } as User;
  const preferences = {
    theme: 'DARK',
    language: 'en',
    timezone: 'UTC',
    notificationsEnabled: true,
    telemetryOptOut: false,
  } as UserPreferences;
  const sessions = [
    {
      id: 'session-1',
      deviceName: 'Chrome on macOS',
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
      createdAt: new Date('2026-01-02T00:00:00Z'),
      lastActiveAt: new Date('2026-01-03T00:00:00Z'),
    } as Session,
  ];
  const oauthAccounts = [
    {
      provider: 'GOOGLE',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    } as OAuthAccount,
  ];
  const auditEvents = [
    {
      type: 'LOGIN',
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
      createdAt: new Date('2026-01-04T00:00:00Z'),
    } as AuditEvent,
  ];

  function buildUseCase(overrides?: {
    user?: User | null;
    preferences?: UserPreferences | null;
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
        .mockResolvedValue(sessions),
      touchLastActive: jest.fn(),
      revoke: jest.fn(),
      revokeAllForUser: jest.fn(),
    };
    const oauthAccountsRepository: jest.Mocked<OAuthAccountsRepository> = {
      findByProviderAccount: jest.fn(),
      create: jest.fn(),
      findByUser: jest
        .fn<OAuthAccountsRepository['findByUser']>()
        .mockResolvedValue(oauthAccounts),
    };
    const userPreferencesRepository: jest.Mocked<UserPreferencesRepository> = {
      createDefault: jest.fn(),
      findByUserId: jest
        .fn<UserPreferencesRepository['findByUserId']>()
        .mockResolvedValue(
          overrides?.preferences === undefined
            ? preferences
            : overrides.preferences,
        ),
      update: jest.fn(),
    };
    const auditService = {
      log: jest.fn(),
      listRecentForUser: jest
        .fn<AuditService['listRecentForUser']>()
        .mockResolvedValue(auditEvents),
    } as unknown as jest.Mocked<AuditService>;

    const useCase = new ExportUserDataUseCase(
      usersRepository,
      sessionsRepository,
      oauthAccountsRepository,
      userPreferencesRepository,
      auditService,
    );
    return { useCase, auditService };
  }

  it("gathers the caller's own account footprint and logs the export", async () => {
    const deps = buildUseCase();

    const result = await deps.useCase.execute(baseInput);

    expect(result.account).toEqual(
      expect.objectContaining({ id: 'user-1', email: 'user@example.com' }),
    );
    expect(result.preferences).toEqual(
      expect.objectContaining({ telemetryOptOut: false }),
    );
    expect(result.sessions).toHaveLength(1);
    expect(result.linkedOAuthAccounts).toEqual([
      { provider: 'GOOGLE', linkedAt: '2026-01-01T00:00:00.000Z' },
    ]);
    expect(result.recentAuditEvents).toHaveLength(1);
    expect(deps.auditService.listRecentForUser).toHaveBeenCalledWith(
      'user-1',
      50,
    );
    expect(deps.auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'DATA_EXPORT_REQUESTED' }),
    );
  });

  it('returns null preferences when none exist yet', async () => {
    const deps = buildUseCase({ preferences: null });

    const result = await deps.useCase.execute(baseInput);

    expect(result.preferences).toBeNull();
  });

  it('rejects when the account no longer exists', async () => {
    const deps = buildUseCase({ user: null });

    await expect(deps.useCase.execute(baseInput)).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(deps.auditService.log).not.toHaveBeenCalled();
  });
});
