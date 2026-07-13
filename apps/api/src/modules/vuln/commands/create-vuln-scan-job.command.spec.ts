import { describe, expect, it, jest } from '@jest/globals';
import { EventBus } from '@nestjs/cqrs';
import { ConfigService } from '@nestjs/config';
import {
  CreateVulnScanJobCommand,
  CreateVulnScanJobHandler,
} from './create-vuln-scan-job.command.js';
import type { WorkspacesRepository } from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import type { ProjectsRepository } from '../../projects/domain/repositories/projects.repository.interface.js';
import type { TargetsRepository } from '../../targets/domain/repositories/targets.repository.interface.js';
import type { VulnScanJobsRepository } from '../domain/repositories/vuln-scan-jobs.repository.interface.js';
import type { VulnScanTemplatesRepository } from '../domain/repositories/vuln-scan-templates.repository.interface.js';
import type { EnvConfig } from '../../../config/env.validation.js';
import type {
  Target,
  VulnScanJob,
  VulnScanJobToolRun,
  Workspace,
} from '../../../prisma-types.js';

function buildDeps() {
  const workspace = { id: 'ws-1' } as Workspace;
  const target = {
    id: 'target-1',
    projectId: 'proj-1',
    type: 'URL',
    value: 'https://example.com',
  } as Target;
  const job = {
    id: 'job-1',
    workspaceId: 'ws-1',
    projectId: 'proj-1',
    targetId: 'target-1',
    scanners: ['NUCLEI'],
    status: 'PENDING',
    toolRuns: [
      {
        id: 'tr-1',
        scanner: 'NUCLEI',
        status: 'PENDING',
      } as VulnScanJobToolRun,
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as VulnScanJob & { toolRuns: VulnScanJobToolRun[] };

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
      .mockResolvedValue({ ...target, tags: [] }),
  } as unknown as jest.Mocked<TargetsRepository>;
  const vulnScanJobsRepository = {
    create: jest.fn<VulnScanJobsRepository['create']>().mockResolvedValue(job),
  } as unknown as jest.Mocked<VulnScanJobsRepository>;
  const vulnScanTemplatesRepository = {
    findByIdForWorkspace:
      jest.fn<VulnScanTemplatesRepository['findByIdForWorkspace']>(),
  } as unknown as jest.Mocked<VulnScanTemplatesRepository>;
  const configService = {
    get: jest.fn((key: string) =>
      key === 'VULN_JOB_TIMEOUT_SECONDS' ? 1800 : 2,
    ),
  } as unknown as jest.Mocked<ConfigService<EnvConfig, true>>;
  const eventBus = { publish: jest.fn() } as unknown as jest.Mocked<EventBus>;

  return {
    workspacesRepository,
    projectsRepository,
    targetsRepository,
    vulnScanJobsRepository,
    vulnScanTemplatesRepository,
    configService,
    eventBus,
    job,
  };
}

describe('CreateVulnScanJobHandler', () => {
  it('resolves the target, validates scanner/target-type compatibility, creates the job, and publishes VulnScanJobCreatedEvent', async () => {
    const deps = buildDeps();
    const handler = new CreateVulnScanJobHandler(
      deps.workspacesRepository,
      deps.projectsRepository,
      deps.targetsRepository,
      deps.vulnScanJobsRepository,
      deps.vulnScanTemplatesRepository,
      deps.configService,
      deps.eventBus,
    );

    const result = await handler.execute(
      new CreateVulnScanJobCommand('user-1', 'target-1', {
        scanners: ['NUCLEI'],
      }),
    );

    expect(deps.vulnScanJobsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        targetId: 'target-1',
        scanners: ['NUCLEI'],
        requestedBy: 'user-1',
        priority: 0,
      }),
    );
    expect(deps.eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        verb: 'vuln_scan_job.created',
        jobId: 'job-1',
      }),
    );
    expect(result.id).toBe('job-1');
  });

  it('rejects a scanner that does not support the target type before ever creating a job', async () => {
    const deps = buildDeps();
    deps.targetsRepository.findById = jest
      .fn<TargetsRepository['findById']>()
      .mockResolvedValue({
        id: 'target-1',
        projectId: 'proj-1',
        type: 'IP_ADDRESS', // FFUF only supports URL
        value: '1.2.3.4',
        tags: [],
      } as never);

    const handler = new CreateVulnScanJobHandler(
      deps.workspacesRepository,
      deps.projectsRepository,
      deps.targetsRepository,
      deps.vulnScanJobsRepository,
      deps.vulnScanTemplatesRepository,
      deps.configService,
      deps.eventBus,
    );

    await expect(
      handler.execute(
        new CreateVulnScanJobCommand('user-1', 'target-1', {
          scanners: ['FFUF'],
        }),
      ),
    ).rejects.toMatchObject({
      code: 'VULN_SCANNER_NOT_SUPPORTED_FOR_TARGET_TYPE',
    });
    expect(deps.vulnScanJobsRepository.create).not.toHaveBeenCalled();
  });

  it('falls back to the template scanners/config when none are supplied directly', async () => {
    const deps = buildDeps();
    deps.vulnScanTemplatesRepository.findByIdForWorkspace = jest
      .fn<VulnScanTemplatesRepository['findByIdForWorkspace']>()
      .mockResolvedValue({
        id: 'tmpl-1',
        workspaceId: 'ws-1',
        scanners: ['NUCLEI', 'NIKTO'],
        config: { NUCLEI: { severity: ['high'] } },
      } as never);

    const handler = new CreateVulnScanJobHandler(
      deps.workspacesRepository,
      deps.projectsRepository,
      deps.targetsRepository,
      deps.vulnScanJobsRepository,
      deps.vulnScanTemplatesRepository,
      deps.configService,
      deps.eventBus,
    );

    await handler.execute(
      new CreateVulnScanJobCommand('user-1', 'target-1', {
        scanners: [],
        templateId: 'tmpl-1',
      }),
    );

    expect(deps.vulnScanJobsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        scanners: ['NUCLEI', 'NIKTO'],
        config: { NUCLEI: { severity: ['high'] } },
        templateId: 'tmpl-1',
      }),
    );
  });
});
