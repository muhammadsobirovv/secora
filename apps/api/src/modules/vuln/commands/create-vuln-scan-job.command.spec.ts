import { describe, expect, it, jest } from '@jest/globals';
import { EventBus } from '@nestjs/cqrs';
import type { ConfigService } from '@nestjs/config';
import type { WorkspacesRepository } from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import type { ProjectsRepository } from '../../projects/domain/repositories/projects.repository.interface.js';
import type { TargetsRepository } from '../../targets/domain/repositories/targets.repository.interface.js';
import type { VulnScanJobsRepository } from '../domain/repositories/vuln-scan-jobs.repository.interface.js';
import type { VulnScanTemplatesRepository } from '../domain/repositories/vuln-scan-templates.repository.interface.js';
import type { Target, Workspace } from '../../../prisma-types.js';
import type { ScopeEngineService } from '../../security/scope-engine.service.js';
import type { QuotaService } from '../../billing/quota.service.js';
import type { UsageService } from '../../billing/usage.service.js';
import { CreateVulnScanJobCommand, CreateVulnScanJobHandler } from './create-vuln-scan-job.command.js';

function buildTarget(overrides?: Partial<Target>): Target {
  return {
    id: 'target-1',
    projectId: 'project-1',
    type: 'DOMAIN',
    value: 'example.com',
    name: null,
    description: null,
    environment: 'UNKNOWN',
    scopeStatus: 'PENDING_REVIEW',
    customFields: null,
    createdBy: 'user-1',
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Target;
}

function buildWorkspace(overrides?: Partial<Workspace>): Workspace {
  return {
    id: 'workspace-1',
    name: 'Test workspace',
    slug: 'test-workspace',
    avatarUrl: null,
    description: null,
    plan: null,
    organizationId: null,
    teamId: null,
    isDemo: false,
    demoExpiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Workspace;
}

function buildHandler(opts: {
  workspace: Workspace;
  create: jest.Mock;
  target?: Target;
  scopeAssert?: jest.Mock;
  /// Module 20 — Phase 8. Same "unlimited by default" reasoning as
  /// create-recon-job.command.spec.ts.
  enforceForWorkspace?: jest.Mock;
  usageRecord?: jest.Mock;
}) {
  const workspacesRepository: WorkspacesRepository = {
    create: jest.fn(),
    addMember: jest.fn(),
    findById: jest.fn(),
    findPersonalWorkspaceForUser: jest.fn(async () => opts.workspace) as unknown as WorkspacesRepository['findPersonalWorkspaceForUser'],
    update: jest.fn(),
    listMembers: jest.fn(),
    isMember: jest.fn(),
  };
  const projectsRepository: Partial<ProjectsRepository> = {
    findByIdForWorkspace: jest.fn(async () => ({ id: 'project-1' })) as unknown as ProjectsRepository['findByIdForWorkspace'],
  };
  const targetsRepository: Partial<TargetsRepository> = {
    findById: jest.fn(async () => opts.target ?? buildTarget()) as unknown as TargetsRepository['findById'],
  };
  const vulnScanJobsRepository: Partial<VulnScanJobsRepository> = {
    create: opts.create as unknown as VulnScanJobsRepository['create'],
  };
  const vulnScanTemplatesRepository: Partial<VulnScanTemplatesRepository> = {
    findByIdForWorkspace: jest.fn(),
  };
  const configService = { get: jest.fn(() => 1800) } as unknown as ConfigService;
  const eventBus = { publish: jest.fn() } as unknown as EventBus;
  const assertExecutionAllowed = opts.scopeAssert ?? jest.fn(async () => ({ decision: 'ALLOWED' }));
  const scopeEngine: Partial<ScopeEngineService> = {
    assertExecutionAllowed: assertExecutionAllowed as unknown as ScopeEngineService['assertExecutionAllowed'],
  };
  const enforceForWorkspace = opts.enforceForWorkspace ?? jest.fn(async () => ({ organizationId: null }));
  const quota: Partial<QuotaService> = {
    enforceForWorkspace: enforceForWorkspace as unknown as QuotaService['enforceForWorkspace'],
  };
  const usageRecord = opts.usageRecord ?? jest.fn(async () => undefined);
  const usage: Partial<UsageService> = {
    record: usageRecord as unknown as UsageService['record'],
  };

  const handler = new CreateVulnScanJobHandler(
    workspacesRepository,
    projectsRepository as ProjectsRepository,
    targetsRepository as TargetsRepository,
    vulnScanJobsRepository as VulnScanJobsRepository,
    vulnScanTemplatesRepository as VulnScanTemplatesRepository,
    configService,
    eventBus,
    scopeEngine as ScopeEngineService,
    quota as QuotaService,
    usage as UsageService,
  );
  return { handler, vulnScanJobsRepository, eventBus, assertExecutionAllowed, enforceForWorkspace, usageRecord };
}

describe('CreateVulnScanJobHandler', () => {
  // Module 15 — task #352 (demo mode). Same guard as
  // CreateReconJobHandler, same reasoning: a demo workspace must never
  // start a real vulnerability scan.

  it('rejects job creation for a demo workspace before touching the repository', async () => {
    const create = jest.fn();
    const { handler, vulnScanJobsRepository, eventBus } = buildHandler({
      workspace: buildWorkspace({ isDemo: true }),
      create,
    });

    await expect(
      handler.execute(new CreateVulnScanJobCommand('user-1', 'target-1', { scanners: ['NUCLEI'] })),
    ).rejects.toMatchObject({ code: 'DEMO_WORKSPACE_READ_ONLY' });

    expect(vulnScanJobsRepository.create).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('creates the job normally for a non-demo workspace', async () => {
    const create = jest.fn(async () => ({ id: 'job-1', toolRuns: [] }));
    const { handler, vulnScanJobsRepository } = buildHandler({
      workspace: buildWorkspace({ isDemo: false }),
      create,
    });

    const result = await handler.execute(
      new CreateVulnScanJobCommand('user-1', 'target-1', { scanners: ['NUCLEI'] }),
    );

    expect(vulnScanJobsRepository.create).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('job-1');
  });

  // Module 16 — Scope Engine (task #370). Same security regression
  // coverage as create-recon-job.command.spec.ts — see that file's
  // comment for why this matters for AI Investigation Mode specifically.

  it('rejects job creation when the Scope Engine denies an out-of-scope target', async () => {
    const create = jest.fn();
    const scopeAssert = jest.fn(async () => {
      throw { code: 'TARGET_OUT_OF_SCOPE', message: 'out of scope' };
    });
    const { handler, vulnScanJobsRepository, eventBus } = buildHandler({
      workspace: buildWorkspace({ isDemo: false }),
      create,
      scopeAssert,
    });

    await expect(
      handler.execute(new CreateVulnScanJobCommand('user-1', 'target-1', { scanners: ['NUCLEI'] })),
    ).rejects.toMatchObject({ code: 'TARGET_OUT_OF_SCOPE' });

    expect(vulnScanJobsRepository.create).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('rejects job creation when the Scope Engine denies a pending-review target', async () => {
    const create = jest.fn();
    const scopeAssert = jest.fn(async () => {
      throw { code: 'TARGET_SCOPE_PENDING_REVIEW', message: 'pending review' };
    });
    const { handler, vulnScanJobsRepository, eventBus } = buildHandler({
      workspace: buildWorkspace({ isDemo: false }),
      create,
      target: buildTarget({ scopeStatus: 'PENDING_REVIEW' }),
      scopeAssert,
    });

    await expect(
      handler.execute(new CreateVulnScanJobCommand('user-1', 'target-1', { scanners: ['NUCLEI'] })),
    ).rejects.toMatchObject({ code: 'TARGET_SCOPE_PENDING_REVIEW' });

    expect(vulnScanJobsRepository.create).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  // Module 20 — Phase 8 (billing finalization). Same `SCANNER_JOBS` quota
  // gate regression coverage as create-recon-job.command.spec.ts.

  it('rejects job creation when the SCANNER_JOBS quota is exceeded, before touching the repository', async () => {
    const create = jest.fn();
    const enforceForWorkspace = jest.fn(async () => {
      throw { code: 'QUOTA_EXCEEDED', message: 'quota exceeded' };
    });
    const { handler, vulnScanJobsRepository, eventBus } = buildHandler({
      workspace: buildWorkspace({ isDemo: false }),
      create,
      enforceForWorkspace,
    });

    await expect(
      handler.execute(new CreateVulnScanJobCommand('user-1', 'target-1', { scanners: ['NUCLEI'] })),
    ).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });

    expect(enforceForWorkspace).toHaveBeenCalledWith('workspace-1', 'user-1', 'SCANNER_JOBS');
    expect(vulnScanJobsRepository.create).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('records SCANNER_JOBS usage against the resolved organizationId after a successful job creation', async () => {
    const create = jest.fn(async () => ({ id: 'job-1', toolRuns: [] }));
    const enforceForWorkspace = jest.fn(async () => ({ organizationId: 'org-1' }));
    const { handler, usageRecord } = buildHandler({
      workspace: buildWorkspace({ isDemo: false }),
      create,
      enforceForWorkspace,
    });

    await handler.execute(new CreateVulnScanJobCommand('user-1', 'target-1', { scanners: ['NUCLEI'] }));
    await Promise.resolve();

    expect(usageRecord).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1', workspaceId: 'workspace-1', resourceType: 'SCANNER_JOBS', quantity: 1 }),
    );
  });
});
