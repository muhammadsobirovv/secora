import { describe, expect, it, jest } from '@jest/globals';
import { EventBus } from '@nestjs/cqrs';
import { ConfigService } from '@nestjs/config';
import {
  CreateReconJobCommand,
  CreateReconJobHandler,
} from './create-recon-job.command.js';
import type { WorkspacesRepository } from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import type { ProjectsRepository } from '../../projects/domain/repositories/projects.repository.interface.js';
import type { TargetsRepository } from '../../targets/domain/repositories/targets.repository.interface.js';
import type { ReconJobsRepository } from '../domain/repositories/recon-jobs.repository.interface.js';
import type { EnvConfig } from '../../../config/env.validation.js';
import type {
  ReconJob,
  ReconJobToolRun,
  Target,
  Workspace,
} from '../../../prisma-types.js';

describe('CreateReconJobHandler', () => {
  it('resolves the target, validates tool/target-type compatibility, creates the job, and publishes ReconJobCreatedEvent', async () => {
    const workspace = { id: 'ws-1' } as Workspace;
    const target = {
      id: 'target-1',
      projectId: 'proj-1',
      type: 'DOMAIN',
      value: 'example.com',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Target;
    const targetWithTags = { ...target, tags: [] };
    const job = {
      id: 'job-1',
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      targetId: 'target-1',
      tools: ['SUBFINDER'],
      status: 'PENDING',
      toolRuns: [
        { id: 'tr-1', tool: 'SUBFINDER', status: 'PENDING' } as ReconJobToolRun,
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as ReconJob & { toolRuns: ReconJobToolRun[] };

    const workspacesRepository = {
      findPersonalWorkspaceForUser: jest
        .fn<WorkspacesRepository['findPersonalWorkspaceForUser']>()
        .mockResolvedValue(workspace),
    } as unknown as jest.Mocked<WorkspacesRepository>;
    const projectsRepository = {
      findByIdForWorkspace: jest
        .fn<ProjectsRepository['findByIdForWorkspace']>()
        .mockResolvedValue({
          id: 'proj-1',
          workspaceId: 'ws-1',
          tags: [],
        } as never),
    } as unknown as jest.Mocked<ProjectsRepository>;
    const targetsRepository = {
      findById: jest
        .fn<TargetsRepository['findById']>()
        .mockResolvedValue(targetWithTags),
    } as unknown as jest.Mocked<TargetsRepository>;
    const reconJobsRepository = {
      create: jest.fn<ReconJobsRepository['create']>().mockResolvedValue(job),
    } as unknown as jest.Mocked<ReconJobsRepository>;
    const configService = {
      get: jest.fn((key: string) =>
        key === 'RECON_JOB_TIMEOUT_SECONDS' ? 600 : 2,
      ),
    } as unknown as jest.Mocked<ConfigService<EnvConfig, true>>;
    const eventBus = { publish: jest.fn() } as unknown as jest.Mocked<EventBus>;

    const handler = new CreateReconJobHandler(
      workspacesRepository,
      projectsRepository,
      targetsRepository,
      reconJobsRepository,
      configService,
      eventBus,
    );

    const result = await handler.execute(
      new CreateReconJobCommand('user-1', 'target-1', { tools: ['SUBFINDER'] }),
    );

    expect(reconJobsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        targetId: 'target-1',
        tools: ['SUBFINDER'],
        requestedBy: 'user-1',
      }),
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ verb: 'recon_job.created', jobId: 'job-1' }),
    );
    expect(result.id).toBe('job-1');
  });

  it('rejects a tool that does not support the target type before ever creating a job', async () => {
    const workspace = { id: 'ws-1' } as Workspace;
    const target = {
      id: 'target-1',
      projectId: 'proj-1',
      type: 'URL', // SUBFINDER only supports DOMAIN
      value: 'https://example.com',
    } as Target;
    const targetWithTags = { ...target, tags: [] };

    const workspacesRepository = {
      findPersonalWorkspaceForUser: jest
        .fn<WorkspacesRepository['findPersonalWorkspaceForUser']>()
        .mockResolvedValue(workspace),
    } as unknown as jest.Mocked<WorkspacesRepository>;
    const projectsRepository = {
      findByIdForWorkspace: jest
        .fn<ProjectsRepository['findByIdForWorkspace']>()
        .mockResolvedValue({
          id: 'proj-1',
          workspaceId: 'ws-1',
          tags: [],
        } as never),
    } as unknown as jest.Mocked<ProjectsRepository>;
    const targetsRepository = {
      findById: jest
        .fn<TargetsRepository['findById']>()
        .mockResolvedValue(targetWithTags),
    } as unknown as jest.Mocked<TargetsRepository>;
    const reconJobsRepository = {
      create: jest.fn(),
    } as unknown as jest.Mocked<ReconJobsRepository>;
    const configService = {
      get: jest.fn(),
    } as unknown as jest.Mocked<ConfigService<EnvConfig, true>>;
    const eventBus = { publish: jest.fn() } as unknown as jest.Mocked<EventBus>;

    const handler = new CreateReconJobHandler(
      workspacesRepository,
      projectsRepository,
      targetsRepository,
      reconJobsRepository,
      configService,
      eventBus,
    );

    await expect(
      handler.execute(
        new CreateReconJobCommand('user-1', 'target-1', {
          tools: ['SUBFINDER'],
        }),
      ),
    ).rejects.toMatchObject({
      code: 'RECON_TOOL_NOT_SUPPORTED_F