import { describe, expect, it, jest } from '@jest/globals';
import { EventBus } from '@nestjs/cqrs';
import { ConfigService } from '@nestjs/config';
import { compileTransactionalTestingModule } from '../../../test-utils/transactional-testing-module.js';
import { VulnScanJobExecutionService } from './vuln-scan-job-execution.service.js';
import {
  VULN_SCAN_JOBS_REPOSITORY,
  type VulnScanJobsRepository,
} from '../domain/repositories/vuln-scan-jobs.repository.interface.js';
import {
  VULN_SCAN_JOB_TOOL_RUNS_REPOSITORY,
  type VulnScanJobToolRunsRepository,
} from '../domain/repositories/vuln-scan-job-tool-runs.repository.interface.js';
import {
  VULN_SCAN_JOB_LOGS_REPOSITORY,
  type VulnScanJobLogsRepository,
} from '../domain/repositories/vuln-scan-job-logs.repository.interface.js';
import {
  VULN_FINDINGS_REPOSITORY,
  type VulnFindingsRepository,
} from '../domain/repositories/vuln-findings.repository.interface.js';
import {
  TARGETS_REPOSITORY,
  type TargetsRepository,
} from '../../targets/domain/repositories/targets.repository.interface.js';
import {
  EVIDENCE_REPOSITORY,
  type EvidenceRepository,
} from '../../evidence/domain/repositories/evidence.repository.interface.js';
import { ScannerRunnerRegistry } from '../scanner-runners/scanner-runner-registry.service.js';
import { PipelineProbeStage } from '../pipeline/probe-stage.service.js';
import { ScanCommandAudit } from '../pipeline/scan-command-audit.service.js';
import { PipelineOrchestrator } from '../pipeline/pipeline-orchestrator.service.js';
import { OwnershipScopeService } from '../pipeline/ownership-scope.service.js';
import { RoeCoverageService } from '../../roe/roe-coverage.service.js';
import { AuditService } from '../../audit/audit.service.js';
import type {
  Target,
  VulnScanJob,
  VulnScanJobToolRun,
} from '../../../prisma-types.js';

function buildJob(overrides: Partial<VulnScanJob> = {}) {
  const toolRuns: VulnScanJobToolRun[] = [
    {
      id: 'tr-1',
      jobId: 'job-1',
      scanner: 'NUCLEI',
      status: 'PENDING',
    } as VulnScanJobToolRun,
    {
      id: 'tr-2',
      jobId: 'job-1',
      scanner: 'FFUF',
      status: 'PENDING',
    } as VulnScanJobToolRun,
  ];
  return {
    id: 'job-1',
    workspaceId: 'ws-1',
    projectId: 'proj-1',
    targetId: 'target-1',
    scanners: ['NUCLEI', 'FFUF'],
    config: null,
    status: 'RUNNING',
    retryCount: 0,
    maxRetries: 2,
    timeoutSeconds: 1800,
    requestedBy: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    toolRuns,
    ...overrides,
  } as unknown as VulnScanJob & { toolRuns: VulnScanJobToolRun[] };
}

async function buildService(
  overrides: {
    cancelRequestedAt?: Date | null;
    pauseRequestedAt?: Date | null;
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
    type: 'URL',
    value: 'https://example.com',
  } as Target;

  const callOrder: string[] = [];
  const defaultRun = (scanner: string) => () => {
    callOrder.push(scanner);
    return Promise.resolve({ exitCode: 0, stdout: '', timedOut: false });
  };
  const runImpls = overrides.runImpls ?? {
    NUCLEI: defaultRun('NUCLEI'),
    FFUF: defaultRun('FFUF'),
  };

  const jobsRepository = {
    findById: jest
      .fn<VulnScanJobsRepository['findById']>()
      .mockImplementation(() =>
        Promise.resolve(
          buildJob({
            cancelRequestedAt: overrides.cancelRequestedAt ?? null,
            pauseRequestedAt: overrides.pauseRequestedAt ?? null,
          }),
        ),
      ),
    markCompleted: jest
      .fn<VulnScanJobsRepository['markCompleted']>()
      .mockResolvedValue(undefined as never),
    markFailed: jest
      .fn<VulnScanJobsRepository['markFailed']>()
      .mockResolvedValue(undefined as never),
    markCancelled: jest
      .fn<VulnScanJobsRepository['markCancelled']>()
      .mockResolvedValue(undefined as never),
    markPaused: jest
      .fn<VulnScanJobsRepository['markPaused']>()
      .mockResolvedValue(undefined as never),
    scheduleRetry: jest
      .fn<VulnScanJobsRepository['scheduleRetry']>()
      .mockResolvedValue(undefined as never),
  } as unknown as jest.Mocked<VulnScanJobsRepository>;
  const toolRunsRepository = {
    markStarted: jest
      .fn<VulnScanJobToolRunsRepository['markStarted']>()
      .mockResolvedValue(undefined as never),
    markComplete: jest
      .fn<VulnScanJobToolRunsRepository['markComplete']>()
      .mockResolvedValue(undefined as never),
  } as unknown as jest.Mocked<VulnScanJobToolRunsRepository>;
  const logsRepository = {
    append: jest
      .fn<VulnScanJobLogsRepository['append']>()
      .mockResolvedValue(undefined as never),
  } as unknown as jest.Mocked<VulnScanJobLogsRepository>;
  const findingsRepository = {
    upsertMany: jest
      .fn<VulnFindingsRepository['upsertMany']>()
      .mockResolvedValue([]),
    list: jest.fn<VulnFindingsRepository['list']>().mockResolvedValue([]),
  } as unknown as jest.Mocked<VulnFindingsRepository>;
  const targetsRepository = {
    findById: jest
      .fn<TargetsRepository['findById']>()
      .mockResolvedValue(target as never),
  } as unknown as jest.Mocked<TargetsRepository>;
  const evidenceRepository = {
    create: jest
      .fn<EvidenceRepository['create']>()
      .mockResolvedValue({ id: 'evidence-1' } as never),
  } as unknown as jest.Mocked<EvidenceRepository>;
  const scannerRunnerRegistry = {
    resolveRunner: jest.fn().mockImplementation((scanner: string) => ({
      scanner,
      run: (ctx: { signal: AbortSignal }) => {
        if (ctx.signal.aborted) {
          return Promise.resolve({
            exitCode: null,
            stdout: '',
            timedOut: true,
          });
        }
        return runImpls[scanner]();
      },
    })),
    resolveNormalizer: jest.fn().mockReturnValue({ normalize: () => [] }),
  };
  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'VULN_JOB_RETRY_BASE_DELAY_MS') return 5000;
      if (key === 'VULN_JOB_RETRY_MAX_DELAY_MS') return 120000;
      return undefined;
    }),
  };
  const eventBus = { publish: jest.fn() };

  const moduleRef = await compileTransactionalTestingModule([
    VulnScanJobExecutionService,
    { provide: VULN_SCAN_JOBS_REPOSITORY, useValue: jobsRepository },
    {
      provide: VULN_SCAN_JOB_TOOL_RUNS_REPOSITORY,
      useValue: toolRunsRepository,
    },
    { provide: VULN_SCAN_JOB_LOGS_REPOSITORY, useValue: logsRepository },
    { provide: VULN_FINDINGS_REPOSITORY, useValue: findingsRepository },
    { provide: TARGETS_REPOSITORY, useValue: targetsRepository },
    { provide: EVIDENCE_REPOSITORY, useValue: evidenceRepository },
    { provide: ScannerRunnerRegistry, useValue: scannerRunnerRegistry },
    { provide: ConfigService, useValue: configService },
    { provide: EventBus, useValue: eventBus },
    { provide: PipelineProbeStage, useValue: { resolvePin: jest.fn(), run: jest.fn() } },
    { provide: ScanCommandAudit, useValue: { record: jest.fn() } },
    { provide: PipelineOrchestrator, useValue: { run: jest.fn() } },
    { provide: OwnershipScopeService, useValue: { ruleFor: jest.fn() } },
    { provide: RoeCoverageService, useValue: { assertStillValid: jest.fn() } },
    { provide: AuditService, useValue: { log: jest.fn() } },
  ]);

  return {
    service: moduleRef.get(VulnScanJobExecutionService),
    jobsRepository,
    toolRunsRepository,
    findingsRepository,
    evidenceRepository,
    eventBus,
    callOrder,
  };
}

describe('VulnScanJobExecutionService', () => {
  it('runs every scanner sequentially in order, persists a LOG evidence per tool-run, and completes the job', async () => {
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

    expect(callOrder).toEqual(['NUCLEI', 'FFUF']);
    expect(toolRunsRepository.markStarted).toHaveBeenCalledTimes(2);
    expect(evidenceRepository.create).toHaveBeenCalledTimes(2);
    expect(jobsRepository.markCompleted).toHaveBeenCalledWith('job-1');
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ verb: 'vuln_scan_job.started' }),
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ verb: 'vuln_scan_job.completed' }),
    );
  });

  it('publishes FindingCreated for new findings and FindingUpdated for re-matched ones', async () => {
    const target = {
      id: 'target-1',
      projectId: 'proj-1',
      type: 'URL',
      value: 'https://example.com',
    } as Target;
    const jobsRepository = {
      findById: jest
        .fn<VulnScanJobsRepository['findById']>()
        .mockResolvedValue(buildJob()),
      markCompleted: jest
        .fn<VulnScanJobsRepository['markCompleted']>()
        .mockResolvedValue(undefined as never),
      // Not expected to be hit on this test's success path, but stubbed
      // so a thrown error elsewhere in execute()'s try/catch (e.g. an
      // incomplete mock on another repository) fails with a clear
      // assertion instead of a confusing "not a function" TypeError.
      scheduleRetry: jest
        .fn<VulnScanJobsRepository['scheduleRetry']>()
        .mockResolvedValue(undefined as never),
    } as unknown as jest.Mocked<VulnScanJobsRepository>;
    const toolRunsRepository = {
      markStarted: jest
        .fn<VulnScanJobToolRunsRepository['markStarted']>()
        .mockResolvedValue(undefined as never),
      markComplete: jest
        .fn<VulnScanJobToolRunsRepository['markComplete']>()
        .mockResolvedValue(undefined as never),
    } as unknown as jest.Mocked<VulnScanJobToolRunsRepository>;
    const logsRepository = {
      append: jest
        .fn<VulnScanJobLogsRepository['append']>()
        .mockResolvedValue(undefined as never),
    } as unknown as jest.Mocked<VulnScanJobLogsRepository>;
    const findingsRepository = {
      upsertMany: jest
        .fn<VulnFindingsRepository['upsertMany']>()
        .mockResolvedValue([
          {
            finding: {
              id: 'f-1',
              severity: 'HIGH',
              scanner: 'NUCLEI',
            } as never,
            wasCreated: true,
          },
          {
            finding: { id: 'f-2', severity: 'LOW', scanner: 'NUCLEI' } as never,
            wasCreated: false,
          },
        ]),
      // countFindings() reads this back once the job completes to compute
      // VulnScanJobDto.findingsCount — the missing stub was the actual
      // root cause of this test's failure (surfaced as a confusing
      // downstream "scheduleRetry is not a function" once the thrown
      // TypeError got caught and routed through the retry/fail path).
      list: jest.fn<VulnFindingsRepository['list']>().mockResolvedValue([]),
    } as unknown as jest.Mocked<VulnFindingsRepository>;
    const targetsRepository = {
      findById: jest
        .fn<TargetsRepository['findById']>()
        .mockResolvedValue(target as never),
    } as unknown as jest.Mocked<TargetsRepository>;
    const evidenceRepository = {
      create: jest
        .fn<EvidenceRepository['create']>()
        .mockResolvedValue({ id: 'ev-1' } as never),
    } as unknown as jest.Mocked<EvidenceRepository>;
    const registry = {
      resolveRunner: jest.fn().mockReturnValue({
        run: () =>
          Promise.resolve({ exitCode: 0, stdout: '', timedOut: false }),
      }),
      resolveNormalizer: jest.fn().mockReturnValue({
        normalize: () => [
          {
            title: 'x',
            description: 'x',
            severity: 'HIGH',
            cvssScore: null,
            cvssVector: null,
            cwe: null,
            owaspCategory: null,
            scannerVersion: null,
            confidence: 'CONFIRMED',
            vulnType: 'x',
            path: '/',
            signature: 'sig',
            matchedAt: 'https://example.com/',
            data: {},
            dedupKey: 'dk',
            tags: [],
            references: [],
            evidence: {},
          },
        ],
      }),
    };
    const eventBus = { publish: jest.fn() };

    const moduleRef = await compileTransactionalTestingModule([
      VulnScanJobExecutionService,
      { provide: VULN_SCAN_JOBS_REPOSITORY, useValue: jobsRepository },
      {
        provide: VULN_SCAN_JOB_TOOL_RUNS_REPOSITORY,
        useValue: toolRunsRepository,
      },
      { provide: VULN_SCAN_JOB_LOGS_REPOSITORY, useValue: logsRepository },
      { provide: VULN_FINDINGS_REPOSITORY, useValue: findingsRepository },
      { provide: TARGETS_REPOSITORY, useValue: targetsRepository },
      { provide: EVIDENCE_REPOSITORY, useValue: evidenceRepository },
      { provide: ScannerRunnerRegistry, useValue: registry },
      { provide: ConfigService, useValue: { get: jest.fn(() => 5000) } },
      { provide: EventBus, useValue: eventBus },
    { provide: PipelineProbeStage, useValue: { resolvePin: jest.fn(), run: jest.fn() } },
    { provide: ScanCommandAudit, useValue: { record: jest.fn() } },
    { provide: PipelineOrchestrator, useValue: { run: jest.fn() } },
    { provide: OwnershipScopeService, useValue: { ruleFor: jest.fn() } },
    { provide: RoeCoverageService, useValue: { assertStillValid: jest.fn() } },
    { provide: AuditService, useValue: { log: jest.fn() } },
    ]);

    await moduleRef
      .get(VulnScanJobExecutionService)
      .execute(buildJob(), new AbortController().signal);

    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        verb: 'vuln_finding.created',
        findingId: 'f-1',
      }),
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        verb: 'vuln_finding.updated',
        findingId: 'f-2',
      }),
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

  it('marks the job FAILED once retries are exhausted', async () => {
    const { service, jobsRepository, eventBus } = await buildService();
    const job = buildJob({ retryCount: 2, maxRetries: 2 });
    const controller = new AbortController();
    controller.abort();

    await service.execute(job, controller.signal);

    expect(jobsRepository.markFailed).toHaveBeenCalledWith(
      'job-1',
      'Job timed out.',
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ verb: 'vuln_scan_job.failed' }),
    );
  });

  it('transitions to CANCELLED when cancelRequestedAt was set', async () => {
    const { service, jobsRepository, eventBus } = await buildService({
      cancelRequestedAt: new Date(),
    });
    await service.execute(buildJob(), new AbortController().signal);

    expect(jobsRepository.markCancelled).toHaveBeenCalledWith('job-1');
    expect(jobsRepository.markCompleted).not.toHaveBeenCalled();
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ verb: 'vuln_scan_job.cancelled' }),
    );
  });

  it('transitions to PAUSED (not CANCELLED/FAILED) when pauseRequestedAt was set, without aborting an in-flight scanner', async () => {
    const { service, jobsRepository, eventBus, callOrder } = await buildService(
      {
        pauseRequestedAt: new Date(),
      },
    );

    await service.execute(buildJob(), new AbortController().signal);

    // Neither scanner ran — pause is checked BEFORE the first one starts.
    expect(callOrder).toEqual([]);
    expect(jobsRepository.markPaused).toHaveBeenCalledWith('job-1');
    expect(jobsRepository.markCancelled).not.toHaveBeenCalled();
    expect(jobsRepository.markFailed).not.toHaveBeenCalled();
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ verb: 'vuln_scan_job.paused' }),
    );
  });

  it('records one scanner as FAILED without aborting the rest of the job', async () => {
    const { service, toolRunsRepository, jobsRepository } = await buildService({
      runImpls: {
        NUCLEI: () => Promise.reject(new Error('boom')),
        FFUF: () =>
          Promise.resolve({ exitCode: 0, stdout: '', timedOut: false }),
      },
    });

    await service.execute(buildJob(), new AbortController().signal);

    expect(toolRunsRepository.markComplete).toHaveBeenCalledWith(
      'tr-1',
      expect.objectContaining({ status: 'FAILED', errorMessage: 'boom' }),
    );
    expect(toolRunsRepository.markComplete).toHaveBeenCalledWith(
      'tr-2',
      expect.objectContaining({ status: 'COMPLETED' }),
    );
    expect(jobsRepository.markCompleted).toHaveBeenCalledWith('job-1');
  });
});
