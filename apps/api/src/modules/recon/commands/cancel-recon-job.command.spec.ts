import { describe, expect, it, jest } from '@jest/globals';
import { EventBus } from '@nestjs/cqrs';
import {
  CancelReconJobCommand,
  CancelReconJobHandler,
} from './cancel-recon-job.command.js';
import type { WorkspacesRepository } from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import type { ReconJobsRepository } from '../domain/repositories/recon-jobs.repository.interface.js';
import type { ReconJob, Workspace } from '../../../prisma-types.js';

function baseJob(overrides: Partial<ReconJob> = {}) {
  return {
    id: 'job-1',
    workspaceId: 'ws-1',
    projectId: 'proj-1',
    targetId: 'target-1',
    status: 'PENDING',
    toolRuns: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as ReconJob & { toolRuns: never[] };
}

describe('CancelReconJobHandler', () => {
  it('transitions a PENDING job straight to CANCELLED and publishes ReconJobCancelledEvent', async () => {
    const workspace = { id: 'ws-1' } as Workspace;
    const job = baseJob({ status: 'PENDING' });
    const cancelled = baseJob({ status: 'CANCELLED' });

    const workspacesRepository = {
      findPersonalWorkspaceForUser: jest
        .fn<WorkspacesRepository['findPersonalWorkspaceForUser']>()
        .mockResolvedValue(workspace),
    } as unknown as jest.Mocked<WorkspacesRepository>;
    const reconJobsRepository = {
      findByIdForWorkspace: jest
        .fn<ReconJobsRepository['findByIdForWorkspace']>()
        .mockResolvedValue(job),
      cancelIfPending: jest
        .fn<ReconJobsRepository['cancelIfPending']>()
        .mockResolvedValue(cancelled),
      findById: jest
        .fn<ReconJobsRepository['findById']>()
        .mockResolvedValue(cancelled),
    } as unknown as jest.Mocked<ReconJobsRepository>;
    const eventBus = { publish: jest.fn() } as unknown as jest.Mocked<EventBus>;

    const handler = new CancelReconJobHandler(
      workspacesRepository,
      reconJobsRepository,
      eventBus,
    );
    const result = await handler.execute(
      new CancelReconJobCommand('user-1', 'job-1'),
    );

    expect(reconJobsRepository.cancelIfPending).toHaveBeenCalledWith('job-1');
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ verb: 'recon_job.cancelled' }),
    );
    expect(result.status).toBe('CANCELLED');
  });

  it('only records intent (requestCancel) for a RUNNING job — the worker performs the real transition', async () => {
    const workspace = { id: 'ws-1' } as Workspace;
    const job = baseJob({ status: 'RUNNING' });

    const workspacesRepository = {
      findPersonalWorkspaceForUser: jest
        .fn<WorkspacesRepository['findPersonalWorkspaceForUser']>()
        .mockResolvedValue(workspace),
    } as unknown as jest.Mocked<WorkspacesRepository>;
    const reconJobsRepository = {
      findByIdForWorkspace: jest
        .fn<ReconJobsRepository['findByIdForWorkspace']>()
        .mockResolvedValue(job),
      requestCancel: jest
        .fn<ReconJobsRepository['requestCancel']>()
        .mockResolvedValue(job),
      findById: jest
        .fn<ReconJobsRepository['findById']>()
        .mockResolvedValue(job),
    } as unknown as jest.Mocked<ReconJobsRepository>;
    const eventBus = { publish: jest.fn() } as unknown as jest.Mocked<EventBus>;

    const handler = new CancelReconJobHandler(
      workspacesRepository,
      reconJobsRepository,
      eventBus,
    );
    await handler.execute(new CancelReconJobCommand('user-1', 'job-1'));

    expect(reconJobsRepository.requestCancel).toHaveBeenCalledWith('job-1');
    // No ReconJobCancelledEvent yet — the job hasn't actually stopped.
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('rejects cancelling a job already in a terminal state', async () => {
    const workspace = { id: 'ws-1' } as Workspace;
    const job = baseJob({ status: 'COMPLETED' });

    const workspacesRepository = {
      findPersonalWorkspaceForUser: jest
        .fn<WorkspacesRepository['findPersonalWorkspaceForUser']>()
        .mockResolvedValue(workspace),
    } as unknown as jest.Mocked<WorkspacesRepository>;
    const reconJobsRepository = {
      findByIdForWorkspace: jest
        .fn<ReconJobsRepository['findByIdForWorkspace']>()
        .mockResolvedValue(job),
    } as unknown as jest.Mocked<ReconJobsRepository>;
    const eventBus = { publish: jest.fn() } as unknown as jest.Mocked<EventBus>;

    const handler = new CancelReconJobHandler(
      workspacesRepository,
      reconJobsRepository,
      eventBus,
    );

    await expect(
      handler.execute(new CancelReconJobCommand('user-1', 'job-1')),
    ).rejects.toMatchObject({ code: 'RECON_JOB_NOT_CANCELLABLE' });
  });
});
