import { describe, expect, it, jest } from '@jest/globals';
import { EventBus } from '@nestjs/cqrs';
import type { ConfigService } from '@nestjs/config';
import type { WorkspacesRepository } from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import type { ProjectsRepository } from '../../projects/domain/repositories/projects.repository.interface.js';
import type { TargetsRepository } from '../../targets/domain/repositories/targets.repository.interface.js';
import type { VulnScanJobsRepository } from '../domain/repositories/vuln-scan-jobs.repository.interface.js';
import type { VulnScanTemplatesRepository } from '../domain/repositories/vuln-scan-templates.repository.interface.js';
import type { Target, Workspace } from '../../../prisma-types.js';
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

function buildHandler(opts: { workspace: Workspace; create: jest.Mock }) {
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
    findById: jest.fn(async () => buildTarget()) as unknown as TargetsRepository['findById'],
  };
  const vulnScanJobsRepository: Partial<VulnScanJobsRepository> = {
    create: opts.create as unknown as VulnScanJobsRepository['create'],
  };
  const vulnScanTemplatesRepository: Partial<VulnScanTemplatesRepository> = {
    findByIdForWorkspace: jest.fn(),
  };
  const configService = { get: jest.fn(() => 1800) } as unknown as ConfigService;
  const eventBus = { publish: jest.fn() } as unknown as EventBus;

  const handler = new CreateVulnScanJobHandler(
    workspacesRepository,
    projectsRepository as ProjectsRepository,
    targetsRepository as TargetsRepository,
    vulnScanJobsRepository as VulnScanJobsRepository,
    vulnScanTemplatesRepository as VulnScanTemplatesRepository,
    configService,
    eventBus,
  );
  return { handler, vulnScanJobsRepository, eventBus };
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
});
