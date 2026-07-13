import { describe, expect, it, jest } from '@jest/globals';
import {
  PauseVulnScanJobCommand,
  PauseVulnScanJobHandler,
} from './pause-vuln-scan-job.command.js';
import type { WorkspacesRepository } from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import type { VulnScanJobsRepository } from '../domain/repositories/vuln-scan-jobs.repository.interface.js';
import type { VulnScanJob, Workspace } from '../../../prisma-types.js';

function baseJob(overrides: Partial<VulnScanJob> = {}) {
  return {
    id: 'job-1',
    workspaceId: 'ws-1',
    projectId: 'proj-1',
    targetId: 'target-1',
    status: 'RUNNING',
    toolRuns: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as VulnScanJob & { toolRuns: never[] };
}

describe('PauseVulnScanJobHandler', () => {
  it('records pause intent (requestPause) for a RUNNING job — the worker performs the real transition', async () => {
    const workspace = { id: 'ws-1' } as Workspace;
    const job = baseJob({ status: 'RUNNING' });
    const paused = baseJob({ status: 'PAUSED' });

    const workspacesRepository = {
      findPersonalWorkspaceForUser: jest
        .fn<WorkspacesRepository['findPersonalWorkspaceForUser']>()
        .mockResolvedValue(workspace),
    } as unknown as jest.Mocked<WorkspacesRepository>;
    const vulnScanJobsRepository = {
      findByIdForWorkspace: jest
        .fn<VulnScanJobsRepository['findByIdForWorkspace']>()
        .mockResolvedValue(job),
      requestPause: jest
        .fn<VulnScanJobsRepository['requestPause']>()
        .mockResolvedValue(job),
      findById: jest
        .fn<VulnScanJobsRepository['findById']>()
        .mockResolvedValue(paused),
    } as unknown as jest.Mocked<VulnScanJobsRepository>;

    const handler = new PauseVulnScanJobHandler(
      workspacesRepository,
      vulnScanJobsRepository,
    );
    const result = await handler.execute(
      new PauseVulnScanJobCommand('user-1', 'job-1'),
    );

    expect(vulnScanJobsRepository.requestPause).toHaveBeenCalledWith('job-1');
    // No event is published here deliberately — VulnScanJobPausedEvent is
    // published by the worker once it actually stops (see
    // VulnScanJobExecutionService), same rationale as Stop's RUNNING case.
    expect(result.status).toBe('PAUSED');
  });

  it('rejects pausing a job that is not RUNNING/RETRYING', async () => {
    const workspace = { id: 'ws-1' } as Workspace;
    const job = baseJob({ status: 'PENDING' });

    const workspacesRepository = {
      findPersonalWorkspaceForUser: jest
        .fn<WorkspacesRepository['findPersonalWorkspaceForUser']>()
        .mockResolvedValue(workspace),
    } as unknown as jest.Mocked<WorkspacesRepository>;
    const vulnScanJobsRepository = {
      findByIdForWorkspace: jest
        .fn<VulnScanJobsRepository['findByIdForWorkspace']>()
        .mockResolvedValue(job),
      requestPause: jest
        .fn<VulnScanJobsRepository['requestPause']>()
        .mockResolvedValue(null),
    } as unknown as jest.Mocked<VulnScanJobsRepository>;

    const handler = new PauseVulnScanJobHandler(
      workspacesRepository,
      vulnScanJobsRepository,
    );

    await expect(
      handler.execute(new PauseVulnScanJobCommand('user-1', 'job-1')),
    ).rejects.toMatchObject({ code: 'VULN_SCAN_JOB_NOT_PAUSABLE' });
  });
});
