import { describe, expect, it, jest } from '@jest/globals';
import { EventBus } from '@nestjs/cqrs';
import {
  ResumeVulnScanJobCommand,
  ResumeVulnScanJobHandler,
} from './resume-vuln-scan-job.command.js';
import type { WorkspacesRepository } from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import type { VulnScanJobsRepository } from '../domain/repositories/vuln-scan-jobs.repository.interface.js';
import type { VulnScanJob, Workspace } from '../../../prisma-types.js';

function baseJob(overrides: Partial<VulnScanJob> = {}) {
  return {
    id: 'job-1',
    workspaceId: 'ws-1',
    projectId: 'proj-1',
    targetId: 'target-1',
    status: 'PAUSED',
    toolRuns: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as VulnScanJob & { toolRuns: never[] };
}

describe('ResumeVulnScanJobHandler', () => {
  it('transitions a PAUSED job to PENDING and publishes VulnScanJobResumedEvent immediately', async () => {
    const workspace = { id: 'ws-1' } as Workspace;
    const job = baseJob({ status: 'PAUSED' });
    const resumed = baseJob({ status: 'PENDING' });

    const workspacesRepository = {
      findPersonalWorkspaceForUser: jest
        .fn<WorkspacesRepository['findPersonalWorkspaceForUser']>()
        .mockResolvedValue(workspace),
    } as unknown as jest.Mocked<WorkspacesRepository>;
    const vulnScanJobsRepository = {
      findByIdForWorkspace: jest
        .fn<VulnScanJobsRepository['findByIdForWorkspace']>()
        .mockResolvedValue(job),
      resumeIfPaused: jest
        .fn<VulnScanJobsRepository['resumeIfPaused']>()
        .mockResolvedValue(resumed),
      findById: jest
        .fn<VulnScanJobsRepository['findById']>()
        .mockResolvedValue(resumed),
    } as unknown as jest.Mocked<VulnScanJobsRepository>;
    const eventBus = { publish: jest.fn() } as unknown as jest.Mocked<EventBus>;

    const handler = new ResumeVulnScanJobHandler(
      workspacesRepository,
      vulnScanJobsRepository,
      eventBus,
    );
    const result = await handler.execute(
      new ResumeVulnScanJobCommand('user-1', 'job-1'),
    );

    expect(vulnScanJobsRepository.resumeIfPaused).toHaveBeenCalledWith('job-1');
    // Unlike Pause, Resume publishes right away — a PAUSED job has no
    // worker watching it, so nothing else will ever emit this event
    // (same rationale as Stop's PAUSED case).
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ verb: 'vuln_scan_job.resumed' }),
    );
    expect(result.status).toBe('PENDING');
  });

  it('rejects resuming a job that is not PAUSED', async () => {
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
      resumeIfPaused: jest
        .fn<VulnScanJobsRepository['resumeIfPaused']>()
        .mockResolvedValue(null),
    } as unknown as jest.Mocked<VulnScanJobsRepository>;
    const eventBus = { publish: jest.fn() } as unknown as jest.Mocked<EventBus>;

    const handler = new ResumeVulnScanJobHandler(
      workspacesRepository,
      vulnScanJobsRepository,
      eventBus,
    );

    await expect(
      handler.execute(new ResumeVulnScanJobCommand('user-1', 'job-1')),
    ).rejects.toMatchObject({ code: 'VULN_SCAN_JOB_NOT_RESUMABLE' });
    expect(eventBus.publish).not.toHaveBeenCalled();
  });
});
