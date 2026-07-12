import { describe, expect, it, jest } from '@jest/globals';
import { EventBus } from '@nestjs/cqrs';
import { ConfigService } from '@nestjs/config';
import { compileTransactionalTestingModule } from '../../../test-utils/transactional-testing-module.js';
import { ReconJobExecutionService } from './recon-job-execution.service.js';
import {
  RECON_JOBS_REPOSITORY,
  type ReconJobsRepository,
} from '../domain/repositories/recon-jobs.repository.interface.js';
import {
  RECON_JOB_TOOL_RUNS_REPOSITORY,
  type ReconJobToolRunsRepository,
} from '../domain/repositories/recon-job-tool-runs.repository.interface.js';
import {
  RECON_JOB_LOGS_REPOSITORY,
  type ReconJobLogsRepository,
} from '../domain/repositories/recon-job-logs.repository.interface.js';
import {
  RECON_FINDINGS_REPOSITORY,
  type ReconFindingsRepository,
} from '../domain/repositories/recon-findings.repository.interface.js';
import {
  TARGETS_REPOSITORY,
  type TargetsRepository,
} from '../../targets/domain/repositories/targets.repository.interface.js';
import {
  EVIDENCE_REPOSITORY,
  type EvidenceRepository,
} from '../../evidence/domain/repositories/evidence.repository.interface.js';
import {
  ATTACHMENTS_REPOSITORY,
  type AttachmentsRepository,
} from '../../attachments/domain/repositories/attachments.repository.interface.js';
import type { StorageService } from '../../../common/providers/storage/storage-service.interface.js';
import { STORAGE_SERVICE } from '../../../common/providers/tokens.js';
import { ToolRunnerRegistry } from '../tool-runners/tool-runner-registry.service.js';
import type {
  ReconJob,
  ReconJobToolRun,
  Target,
} from '../../../prisma-types.js';

function buildJob(overrides: Partial<ReconJob> = {}) {
  const toolRuns: ReconJobToolRun[] = [
    {
      id: 'tr-1',
      jobId: 'job-1',
      tool: 'SUBFINDER',
      status: 'PENDING',
    } as ReconJobToolRun,
    {
      id: 'tr-2',
      jobId: 'job-1',
      tool: 'DNSX',
      status: 'PENDING',
    } as ReconJobToolRun,
  ];
  return {
    id: 'job-1',
    workspaceId: 'ws-1',
    projectId: 'proj-1',
    targetId: 'target-1',
    tools: ['SUBFINDER', 'DNSX'],
    status: 'RUNNING',
    retryCount: 0,
    maxRetries: 2,
    timeoutSeconds: 600,
    requestedBy: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    toolRuns,
    ...overrides,
  } as unknown as ReconJob & { toolRuns: ReconJobToolRun[] };
}

async function buildService(
  overrides: {
    cancelRequestedAt?: Date | null;
    runImpls?: Record<
      string,
      () => Promise<{
        exitCode: number | null;
        stdout: string;
        timedOut: boolean;
      }>
    >;
  } = {},
) {
  const target = {
    id: 'target-1',
    projectId: 'proj-1',
    type: 'DOMAIN',
    value: 'example.com',
  } as Target;

  const callOrder: string[] = [];
  const defaultRun = (tool: string) => () => {
    callOrder.push(tool);
    return Promise.resolve({ exitCode: 0, stdout: '', timedOut: false });
  };
  const runImpls = overrides.runImpls ?? {
    SUBFINDER: defaultRun('SUBFINDER'),
    DNSX: defaultRun('DNSX'),
  };

  const jobsRepository = {
    findById: jest
      .fn<ReconJobsRepository['findById']>()
      .mockImplementation(() =>
        Promise.resolve(
          buildJob({
            cancelRequestedAt: overrides.cancelRequestedAt ?? null,
          }),
        ),
      ),
    markCompleted: jest
      .fn<ReconJobsRepository['markCompleted']>()
      .mockResolvedValue(undefined as never),
    markFailed: jest
      .fn<ReconJobsRepository['markFailed']>()
      .mockResolvedValue(undefined as never),
    markCancelled: jest
      .fn<ReconJobsRepository['markCancelled']>()
      .mockResolvedValue(undefined as never),
    scheduleRetry: jest
      .fn<ReconJobsRepository['scheduleRetry']>()
      .mockResolvedValue(undefined as never),
  } as unknown as jest.Mocked<ReconJobsRepository>;
  const toolRunsRepository = {
    markStarted: jest
      .fn<ReconJobToolRunsRepository['markStarted']>()
      .mockResolvedValue(undefined as never),
    markComplete: jest
      .fn<ReconJobToolRunsRepository['markComplete']>()
      .mockResolvedValue(undefined as never),
  } as unknown as jest.Mocked<ReconJobToolRunsRepository>;
  const logsRepository = {
    append: jest
      .fn<ReconJobLogsRepository['append']>()
      .mockResolvedValue(undefined as never),
  } as unknown as jest.Mocked<ReconJobLogsRepository>;
  const findingsRepository = {
    upsertMany: jest
      .fn<ReconFindingsRepository['upsertMany']>()
      .mockResolvedValue([]),
    list: jest.fn<ReconFindingsRepository['list']>().mockResolvedValue([]),
  } as unknown as jest.Mocked<ReconFindingsRepository>;
  const targetsRepository = {
    findById: jest
      .fn<TargetsRepository['findById']>()
      .mockResolvedValue(target as never),
  } as unknown as jest.Mocked<TargetsRepository>;
  const evidenceRepository = {
    create: jest
      .fn<EvidenceRepository['create']>()
      .mockResolvedValue({ id: 'evidence-1' } as never),
    update: jest
      .fn<EvidenceRepository['update']>()
      .mockResolvedValue(undefined as never),
  } as unknown as jest.Mocked<EvidenceRepository>;
  const attachmentsRepository = {
    create: jest
      .fn<AttachmentsRepository['create']>()
      .mockResolvedValue({ id: 'attachment-1' } as never),
  } as unknown as jest.Mocked<AttachmentsRepository>;
  const storageService = {
    upload: jest
      .fn<StorageService['upload']>()
      .mockResolvedValue({ key: 'k', url: 'file://k' }),
  } as unknown as jest.Mocked<StorageService>;
  const toolRunnerRegistry = {
    resolveRunner: jest.fn().mockImplementation((tool: string) => ({
      tool,
      run: (ctx: { signal: AbortSignal }) => {
        if (ctx.signal.aborted) {
          return Promise.resolve({
            exitCode: null,
            stdout: '',
            timedOut: true,
          });
        }
        return runImpls[tool]();
      },
    })),
    resolveNormalizer: jest.fn().mockReturnValue({ normalize: () => [] }),
  };
  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'RECON_JOB_RETRY_BASE_DELAY_MS') return 5000;
      if (key === 'RECON_JOB_RETRY_MAX_DELAY_MS') return 120000;
      return undefined;
    }),
  };
  const eventBus = { publish: jest.fn() };

  const moduleRef = await compileTransactionalTestingModule([
    ReconJobExecutionService,
    { provide: RECON_JOBS_REPOSITORY, useValue: jobsRepository },
    { provide: RECON_JOB_TOOL_RUNS_REPOSITORY, useValue: toolRunsRepository },
    { provide: RECON_JOB_LOGS_REPOSITORY, useValue: logsRepository },
    { provide: RECON_FINDINGS_REPOSITORY, useValue: findingsRepository },
    { provide: TARGETS_REPOSITORY, useValue: targetsRepository },
    { provide: EVIDENCE_REPOSITORY, useValue: evidenceRepository },
    { provide: ATTACHMENTS_REPOSITORY, useValue: attachmentsRepository },
    { provide: STORAGE_SERVICE, useValue: storageService },
    { provide: ToolRunnerRegistry, useValue: toolRunnerRegistry },
    { provide: ConfigService, useValue: configService },
    { provide: EventBus, useValue: eventBus },
  ]);

  return {
    service: moduleRef.get(ReconJobExecutionService),
    jobsRepository,
    toolRunsRepository,
    findingsRepository,
    evidenceRepository,
    eventBus,
    callOrder,
  };
}

describe('ReconJobExecutionService', () => {
  it('runs every tool sequentially in order, persists findings, and completes the job', async () => {
    const {
      service,
      jobsRepository,
      toolRunsRepository,
      evidenceRepository,
      eventBus,
      callOrder,
    } = await buildService();
    const job = buildJob();

    await service.execute(job, new AbortController().signal);

    expect(callOrder).toEqual(['SUBFINDER', 'DNSX']);
    expect(toolRunsRepository.markStarted).toHaveBeenCalledTimes(2);
    // One LOG Evidence per tool-run.
    expect(evidenceRepository.create).toHaveBeenCalledTimes(2);
    expect(jobsRepository.markCompleted).toHaveBeenCalledWith('job-1');
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ verb: 'recon_job.started' }),
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ verb: 'recon_job.completed' }),
    );
    // Completion is published only after the DB write resolved.
    const completedCallIndex = eventBus.publish.mock.calls.findIndex(
      (c) => (c[0] as { verb: string }).verb === 'recon_job.completed',
    );
    expect(completedCallIndex).toBeGreaterThan(-1);
    expect(
      jobsRepository.markCompleted.mock.invocationCallOrder[0],
    ).toBeLessThan(
      eventBus.publish.mock.invocationCallOrder[completedCallIndex],
    );
  });

  it('schedules a retry with backoff when the job times out and retries remain', async () => {
    const { service, jobsRepository } = await buildService();
    const job = buildJob({ retryCount: 0, maxRetries: 2 });
    const controller = new AbortController();
    controller.abort();

    await service.execute(job, controller.signal);

    expect(jobsRepository.scheduleRetry).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ retryCount: 1, error: 'Job timed out.' }),
    );
    expect(jobsRepository.markFailed).not.toHaveBeenCalled();
  });

  it('marks the job FAILED and publishes ReconJobFailedEvent once retries are exhausted', async () => {
    const { service, jobsRepository, eventBus } = await buildService();
    const job = buildJob({ retryCount: 2, maxRetries: 2 });
    const controller = new AbortController();
    controller.abort();

    await service.execute(job, controller.signal);

    expect(jobsRepository.markFailed).toHaveBeenCalledWith(
      'job-1',
      'Job timed out.',
    );
    expect(jobsRepository.scheduleRetry).not.toHaveBeenCalled();
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ verb: 'recon_job.failed' }),
    );
  });

  it('transitions to CANCELLED and publishes ReconJobCancelledEvent when cancelRequestedAt was set', async () => {
    const { service, jobsRepository, eventBus } = await buildService({
      cancelRequestedAt: new Date(),
    });
    const job = buildJob();

    await service.execute(job, new AbortController().signal);

    expect(jobsRepository.markCancelled).toHaveBeenCalledWith('job-1');
    expect(jobsRepository.markCompleted).not.toHaveBeenCalled();
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ verb: 'recon_job.cancelled' }),
    );
  });

  it('records one tool as FAILED without aborting the rest of the job', async () => {
    const { service, toolRunsRepository, jobsRepository } = await buildService({
      runImpls: {
        SUBFINDER: () => Promise.reject(new Error('boom')),
        DNSX: () =>
          Promise.resolve({ exitCode: 0, stdout: '', timedOut: false }),
      },
    });
    const job = buildJob();

    await service.execute(job, new AbortController().signal);

    expect(toolRunsRepository.markComplete).toHaveBeenCalledWith(
      'tr-1',
      expect.objectContaining({ status: 'FAILED', errorMessage: 'boom' }),
    );
    expect(toolRunsRepository.markComplete).toHaveBeenCalledWith(
  