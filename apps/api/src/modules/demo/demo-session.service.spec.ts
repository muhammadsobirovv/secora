import { describe, expect, it, jest } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';
import type { UsersRepository } from '../auth/domain/repositories/users.repository.interface.js';
import type { WorkspacesRepository } from '../workspaces/domain/repositories/workspaces.repository.interface.js';
import type { UserPreferencesRepository } from '../user-preferences/domain/repositories/user-preferences.repository.interface.js';
import type { RbacService } from '../rbac/rbac.service.js';
import type { AuditService } from '../audit/audit.service.js';
import type { SessionIssuerService } from '../auth/services/session-issuer.service.js';
import type { DemoSeedService } from './demo-seed.service.js';
import { DemoSessionService } from './demo-session.service.js';

function buildService(opts: { demoModeEnabled: boolean; ttlHours?: number }) {
  const usersRepository: Partial<UsersRepository> = {
    create: jest.fn(async () => ({ id: 'demo-user-1', email: 'demo+x@demo.pentesthub.local' })) as unknown as UsersRepository['create'],
  };
  const workspacesRepository: Partial<WorkspacesRepository> = {
    create: jest.fn(async () => ({ id: 'demo-workspace-1' })) as unknown as WorkspacesRepository['create'],
    addMember: jest.fn(),
  };
  const userPreferencesRepository: Partial<UserPreferencesRepository> = {
    createDefault: jest.fn(),
    update: jest.fn(),
  };
  const rbacService: Partial<RbacService> = { assignDefaultRole: jest.fn() };
  const auditService: Partial<AuditService> = { log: jest.fn() };
  const sessionIssuer: Partial<SessionIssuerService> = {
    issue: jest.fn(async () => ({ accessToken: 'a', refreshToken: 'b', expiresIn: 900 })),
  };
  const demoSeed: Partial<DemoSeedService> = { seed: jest.fn() };
  const config: Record<string, unknown> = {
    DEMO_MODE_ENABLED: opts.demoModeEnabled,
    DEMO_SESSION_TTL_HOURS: opts.ttlHours ?? 24,
  };
  const configService = { get: jest.fn((key: string) => config[key]) } as unknown as ConfigService;

  const service = new DemoSessionService(
    usersRepository as UsersRepository,
    workspacesRepository as WorkspacesRepository,
    userPreferencesRepository as UserPreferencesRepository,
    rbacService as RbacService,
    auditService as AuditService,
    sessionIssuer as SessionIssuerService,
    demoSeed as DemoSeedService,
    configService,
  );
  return { service, usersRepository, workspacesRepository, demoSeed, sessionIssuer, auditService };
}

describe('DemoSessionService', () => {
  it('rejects starting a session when DEMO_MODE_ENABLED is false, before creating anything', async () => {
    const { service, usersRepository, workspacesRepository, demoSeed } = buildService({ demoModeEnabled: false });

    await expect(service.start({ ipAddress: '1.2.3.4', userAgent: 'test' })).rejects.toMatchObject({
      code: 'DEMO_MODE_DISABLED',
    });

    expect(usersRepository.create).not.toHaveBeenCalled();
    expect(workspacesRepository.create).not.toHaveBeenCalled();
    expect(demoSeed.seed).not.toHaveBeenCalled();
  });

  it('creates a demo user + isDemo workspace, seeds data, and issues a real session when enabled', async () => {
    const { service, usersRepository, workspacesRepository, demoSeed, sessionIssuer, auditService } = buildService({
      demoModeEnabled: true,
    });

    const tokens = await service.start({ ipAddress: '1.2.3.4', userAgent: 'test' });

    expect(usersRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ passwordHash: null, emailVerified: true }),
    );
    expect(workspacesRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ isDemo: true, demoExpiresAt: expect.any(Date) }),
    );
    expect(workspacesRepository.addMember).toHaveBeenCalledWith('demo-workspace-1', 'demo-user-1', 'OWNER');
    expect(demoSeed.seed).toHaveBeenCalledWith('demo-workspace-1', 'demo-user-1');
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ type: 'DEMO_SESSION_STARTED' }));
    expect(sessionIssuer.issue).toHaveBeenCalledTimes(1);
    expect(tokens).toEqual({ accessToken: 'a', refreshToken: 'b', expiresIn: 900 });
  });
});
