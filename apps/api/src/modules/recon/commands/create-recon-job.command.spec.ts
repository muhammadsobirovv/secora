import { describe, expect, it, jest } from '@jest/globals';
import { EventBus } from '@nestjs/cqrs';
import type { ConfigService } from '@nestjs/config';
import type { WorkspacesRepository } from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import type { ProjectsRepository } from '../../projects/domain/repositories/projects.repository.interface.js';
import type { TargetsRepository } from '../../targets/domain/repositories/targets.repository.interface.js';
import type { ReconJobsRepository } from '../domain/repositories/recon-jobs.repository.interface.js';
import type { Target, Workspace } from '../../../prisma-types.js';
import type { ScopeEngineService } from '../../security/scope-engine.service.js';
import { CreateReconJobCommand, CreateReconJobHandler } from './create-recon-job.command.js';
import * as requestContext from '../../../observability/request-context.js';

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
  /// Module 16 — task #370. Defaults to an ALLOW decision so the existing
  /// (pre-Module-16) tests below don't need to know about Scope Engine
  /// internals; scope-specific behavior gets its own dedicated tests.
  scopeAssert?: jest.Mock;
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
  const reconJobsRepository: Partial<ReconJobsRepository> = {
    create: opts.create as unknown as ReconJobsRepository['create'],
  };
  const configService = { get: jest.fn(() => 600) } as unknown as ConfigService;
  const eventBus = { publish: jest.fn() } as unknown as EventBus;
  const assertExecutionAllowed = opts.scopeAssert ?? jest.fn(async () => ({ decision: 'ALLOWED' }));
  const scopeEngine: Partial<ScopeEngineService> = {
    assertExecutionAllowed: assertExecutionAllowed as unknown as ScopeEngineService['assertExecutionAllowed'],
  };

  const handler = new CreateReconJobHandler(
    workspacesRepository,
    projectsRepository as ProjectsRepository,
    targetsRepository as TargetsRepository,
    reconJobsRepository as ReconJobsRepository,
    configService,
    eventBus,
    scopeEngine as ScopeEngineService,
  );
  return { handler, reconJobsRepository, eventBus, assertExecutionAllowed };
}

describe('CreateReconJobHandler', () => {
  // Module 15 — task #352 (demo mode). The one behavior this task added
  // here: a demo workspace (isDemo: true) must never be able to start a
  // real recon job, since POST /demo/session is an unauthenticated,
  // publicly reachable entry point.

  it('rejects job creation for a demo workspace before touching the repository', async () => {
    const create = jest.fn();
    const { handler, reconJobsRepository, eventBus } = buildHandler({
      workspace: buildWorkspace({ isDemo: true }),
      create,
    });

    await expect(
      handler.execute(new CreateReconJobCommand('user-1', 'target-1', { tools: ['NMAP'] })),
    ).rejects.toMatchObject({ code: 'DEMO_WORKSPACE_READ_ONLY' });

    expect(reconJobsRepository.create).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('creates the job normally for a non-demo workspace', async () => {
    const create = jest.fn(async () => ({ id: 'job-1', toolRuns: [] }));
    const { handler, reconJobsRepository } = buildHandler({
      workspace: buildWorkspace({ isDemo: false }),
      create,
    });

    const result = await handler.execute(
      new CreateReconJobCommand('user-1', 'target-1', { tools: ['NMAP'] }),
    );

    expect(reconJobsRepository.create).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('job-1');
  });

  // Module 16 — Scope Engine (task #370). Security regression tests per
  // this turn's explicit instruction: "out-of-scope target execution" and
  // "pending-review target execution" must always be rejected, for every
  // tool-execution entry point — CreateReconJobCommand is one of the two
  // canonical dispatch paths AI Investigation Mode itself reuses, so a
  // regression here would silently reopen a bypass for AI-triggered scans
  // too.

  it('rejects job creation when the Scope Engine denies an out-of-scope target', async () => {
    const create = jest.fn();
    const scopeAssert = jest.fn(async () => {
      throw { code: 'TARGET_OUT_OF_SCOPE', message: 'out of scope' };
    });
    const { handler, reconJobsRepository, eventBus } = buildHandler({
      workspace: buildWorkspace({ isDemo: false }),
      create,
      scopeAssert,
    });

    await expect(
      handler.execute(new CreateReconJobCommand('user-1', 'target-1', { tools: ['NMAP'] })),
    ).rejects.toMatchObject({ code: 'TARGET_OUT_OF_SCOPE' });

    expect(scopeAssert).toHaveBeenCalledTimes(1);
    expect(reconJobsRepository.create).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('rejects job creation when the Scope Engine denies a pending-review target', async () => {
    const create = jest.fn();
    const scopeAssert = jest.fn(async () => {
      throw { code: 'TARGET_SCOPE_PENDING_REVIEW', message: 'pending review' };
    });
    const { handler, reconJobsRepository, eventBus } = buildHandler({
      workspace: buildWorkspace({ isDemo: false }),
      create,
      target: buildTarget({ scopeStatus: 'PENDING_REVIEW' }),
      scopeAssert,
    });

    await expect(
      handler.execute(new CreateReconJobCommand('user-1', 'target-1', { tools: ['NMAP'] })),
    ).rejects.toMatchObject({ code: 'TARGET_SCOPE_PENDING_REVIEW' });

    expect(reconJobsRepository.create).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('passes the resolved target and workspace to the Scope Engine before creating the job — never AI/client-supplied values', async () => {
    const create = jest.fn(async () => ({ id: 'job-1', toolRuns: [] }));
    const target = buildTarget({ id: 'target-1', scopeStatus: 'IN_SCOPE', projectId: 'project-1' });
    const { handler, assertExecutionAllowed } = buildHandler({
      workspace: buildWorkspace({ isDemo: false, id: 'workspace-1' }),
      create,
      target,
    });

    await handler.execute(new CreateReconJobCommand('user-1', 'target-1', { tools: ['NMAP'] }));

    expect(assertExecutionAllowed).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        workspaceId: 'workspace-1',
        operationType: 'RECON_JOB',
        target: expect.objectContaining({ id: 'target-1', scopeStatus: 'IN_SCOPE' }),
      }),
    );
  });

  // Module 18 — task #505 (Request correlation/traceability).
  it('stamps the created job with the active request-context requestId, so a worker-process log line for this job can be correlated back to the request that queued it', async () => {
    jest.spyOn(requestContext, 'getRequestId').mockReturnValue('req-recon-abc');
    const create = jest.fn(async () => ({ id: 'job-1', toolRuns: [] }));
    const { handler } = buildHandler({
      workspace: buildWorkspace({ isDemo: false }),
      create,
    });

    await handler.execute(new CreateReconJobCommand('user-1', 'target-1', { tools: ['NMAP'] }));

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'req-recon-abc' }));
    jest.restoreAllMocks();
  });
});
