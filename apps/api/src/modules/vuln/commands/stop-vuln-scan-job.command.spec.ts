import { describe, expect, it, jest } from '@jest/globals';
import { EventBus } from '@nestjs/cqrs';
import {
  StopVulnScanJobCommand,
  StopVulnScanJobHandler,
} from './stop-vuln-scan-job.command.js';
import type { WorkspacesRepository } from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import type { VulnScanJobsRepository } from '../domain/repositories/vuln-scan-jobs.repository.interface.js';
import type { VulnScanJob, Workspace } from '../../../prisma-types.js';

function baseJob(overrides: Partial<VulnScanJob> = {}) {
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
  } as unknown as VulnScanJob & { toolRuns: never[] };
}

describe('StopVulnScanJobHandler', () => {
  it('transitions a PENDING job straight to CANCELLED and publishes VulnScanJobCancelledEvent', async () => {
    const workspace = { id: 'ws-1' } as Workspace;
    const job = baseJob({ status: 'PENDING' });
    const cancelled = baseJob({ status: 'CANCELLED' });

    const workspacesRepository = {
      findPersonalWorkspaceForUser: jest
        .fn<WorkspacesRepository['findPersonalWorkspaceForUser']>()
        .mockResolvedValue(workspace),
    } as unknown as jest.Mocked<WorkspacesRepository>;
    const vulnScanJobsRepository = {
      findByIdForWorkspace: jest
        .fn<VulnScanJobsRepository['findByIdForWorkspace']>()
        .mockResolvedValue(job),
      cancelIfPending: jest
        .fn<VulnScanJobsRepository['cancelIfPending']>()
        .mockResolvedValue(cancelled),
      findById: jest
        .fn<VulnScanJobsRepository['findById']>()
        .mockResolvedValue(cancelled),
    } as unknown as jest.Mocked<VulnScanJobsRepository>;
    const eventBus = { publish: jest.fn() } as unknown as jest.Mocked<EventBus>;

    const handler = new StopVulnScanJobHandler(
      workspacesRepository,
      vulnScanJobsRepository,
      eventBus,
    );
    const result = await handler.execute(
      new StopVulnScanJobCommand('user-1', 'job-1'),
    );

    expect(vulnScanJobsRepository.cancelIfPending).toHaveBeenCalledWith(
      'job-1',
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ verb: 'vuln_scan_job.cancelled' }),
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
    const vulnScanJobsRepository = {
      findByIdForWorkspace: jest
        .fn<VulnScanJobsRepository['findByIdForWorkspace']>()
        .mockResolvedValue(job),
      requestCancel: jest
        .fn<VulnScanJobsRepository['requestCancel']>()
        .mockResolvedValue(job),
      findById: jest
        .fn<VulnScanJobsRepository['findById']>()
        .mockResolvedValue(job),
    } as unknown as jest.Mocked<VulnScanJobsRepository>;
    const eventBus = { publish: jest.fn() } as unknown as jest.Mocked<EventBus>;

    const handler = new StopVulnScanJobHandler(
      workspacesRepository,
      vulnScanJobsRepository,
      eventBus,
    );
    await handler.execute(new StopVulnScanJobCommand('user-1', 'job-1'));

    expect(vulnScanJobsRepository.requestCancel).toHaveBeenCalledWith('job-1');
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('cancels a PAUSED job directly and publishes the event immediately (no worker is watching it)', async () => {
    const workspace = { id: 'ws-1' } as Workspace;
    const job = baseJob({ status: 'PAUSED' });

    const workspacesRepository = {
      findPersonalWorkspaceForUser: jest
        .fn<WorkspacesRepository['findPersonalWorkspaceForUser']>()
        .mockResolvedValue(workspace),
    } as unknown as jest.Mocked<WorkspacesRepository>;
    const vulnScanJobsRepository = {
      findByIdForWorkspace: jest
        .fn<VulnScanJobsRepository['findByIdForWorkspace']>()
        .mockResolvedValue(job),
      requestCancel: jest
        .fn<VulnScanJobsRepository['requestCancel']>()
        .mockResolvedValue(baseJob({ status: 'CANCELLED' })),
      findById: jest
        .fn<VulnScanJobsRepository['findById']>()
        .mockResolvedValue(baseJob({ status: 'CANCELLED' })),
    } as unknown as jest.Mocked<VulnScanJobsRepository>;
    const eventBus = { publish: jest.fn() } as unknown as jest.Mocked<EventBus>;

    const handler = new StopVulnScanJobHandler(
      workspacesRepository,
      vulnScanJobsRepository,
      eventBus,
    );
    const result = await handler.execute(
      new StopVulnScanJobCommand('user-1', 'job-1'),
    );

    expect(vulnScanJobsRepository.requestCancel).toHaveBeenCalledWith('job-1');
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ verb: 'vuln_scan_job.cancelled' }),
    );
    expect(result.status).toBe('CANCELLED');
  });

  it('rejects cancelling a job already in a terminal state', async () => {
    const workspace = { id: 'ws-1' } as Workspace;
    const job = baseJob({ status: 'COMPLETED' });

    const workspacesRepository = {
      findPersonalWorkspaceForUser: jest
        .fn<WorkspacesRepository['findPersonalWorkspaceForUser']>()
        .mockResolvedValue(workspace),
    } as unknown as jest.Mocked<WorkspacesRepository>;
    const vulnScanJobsRepository = {
      findByIdForWorkspace: jest
        .fn<VulnScanJobsRepository['findByIdForWorkspace']>()
        .mockResolvedValue(job),
    } as unknown as jest.Mocked<VulnScanJobsRepository>;
    const eventBus = { publish: jest.fn() } as unknown as jest.Mocked<EventBus>;

    const handler = new StopVulnScanJobHandler(
      workspacesRepository,
      vulnScanJobsRepository,
      eventBus,
    );

    await expect(
      handler.execute(new StopVulnScanJobCommand('user-1', 'job-1')),
    ).rejects.toMatchObject({ code: 'VULN_SCAN_JOB_NOT_CANCELLABLE' });
  });
});
