import { describe, expect, it, jest } from '@jest/globals';
import { EventBus } from '@nestjs/cqrs';
import { ConfigService } from '@nestjs/config';
import { compileTransactionalTestingModule } from '../../../test-utils/transactional-testing-module.js';
import { VulnScanJobExecutionService } from './vuln-scan-job-execution.service.js';
import { VULN_SCAN_JOBS_REPOSITORY } from '../domain/repositories/vuln-scan-jobs.repository.interface.js';
import { VULN_SCAN_JOB_TOOL_RUNS_REPOSITORY } from '../domain/repositories/vuln-scan-job-tool-runs.repository.interface.js';
import { VULN_SCAN_JOB_LOGS_REPOSITORY } from '../domain/repositories/vuln-scan-job-logs.repository.interface.js';
import { VULN_FINDINGS_REPOSITORY } from '../domain/repositories/vuln-findings.repository.interface.js';
import { TARGETS_REPOSITORY } from '../../targets/domain/repositories/targets.repository.interface.js';
import { EVIDENCE_REPOSITORY } from '../../evidence/domain/repositories/evidence.repository.interface.js';
import { ScannerRunnerRegistry } from '../scanner-runners/scanner-runner-registry.service.js';
import { PipelineProbeStage } from '../pipeline/probe-stage.service.js';
import { ScanCommandAudit } from '../pipeline/scan-command-audit.service.js';
import { PinBlockedError, type PinnedHost } from '../pipeline/pin.util.js';
import type { ScannerRunContext } from '../scanner-runners/scanner-runner.interface.js';
import type { VulnScanJob, VulnScanJobToolRun } from '../../../prisma-types.js';

const pin: PinnedHost = { host: 'shop.example.org', ip: '93.184.216.34', family: 4 };

function buildJob(config: Record<string, unknown> | null) {
  const toolRuns = [
    { id: 'tr-1', jobId: 'job-1', scanner: 'NUCLEI', status: 'PENDING' } as VulnScanJobToolRun,
  ];
  return {
    id: 'job-1',
    workspaceId: 'ws-1',
    projectId: 'proj-1',
    targetId: 'target-1',
    scanners: ['NUCLEI'],
    config,
    status: 'RUNNING',
    retryCount: 0,
    maxRetries: 0,
    timeoutSeconds: 1800,
    requestedBy: 'user-1',
    toolRuns,
  } as unknown as VulnScanJob & { toolRuns: VulnScanJobToolRun[] };
}

async function harness(options: {
  config: Record<string, unknown> | null;
  deepEnabled?: boolean;
  resolvePin?: () => Promise<PinnedHost>;
  probe?: { outcome: 'OK' | 'TIMED_OUT' | 'ABORTED'; liveUrls: string[] };
  runResult?: { exitCode: number | null; stdout: string; timedOut: boolean };
}) {
  const job = buildJob(options.config);
  const logs: { level: string; message: string }[] = [];
  const captured: { ctx?: ScannerRunContext } = {};

  const jobsRepository = {
    findById: jest.fn(async () => ({ ...job, cancelRequestedAt: null, pauseRequestedAt: null })),
    markCompleted: jest.fn(async () => undefined),
    markFailed: jest.fn(async () => undefined),
    markCancelled: jest.fn(async () => undefined),
    markPaused: jest.fn(async () => undefined),
    scheduleRetry: jest.fn(async () => undefined),
  };
  const toolRunsRepository = {
    markStarted: jest.fn(async () => undefined),
    markComplete: jest.fn(async () => undefined),
  };
  const logsRepository = {
    append: jest.fn(async (entry: { level: string; message: string }) => {
      logs.push({ level: entry.level, message: entry.message });
    }),
  };
  const findingsRepository = {
    upsertMany: jest.fn(async () => []),
    list: jest.fn(async () => []),
  };
  const targetsRepository = {
    findById: jest.fn(async () => ({
      id: 'target-1',
      projectId: 'proj-1',
      type: 'DOMAIN',
      value: 'shop.example.org',
    })),
  };
  const evidenceRepository = { create: jest.fn(async () => ({ id: 'ev-1' })) };

  const normalize = jest.fn((_stdout: string) => []);
  const run = jest.fn(async (ctx: ScannerRunContext) => {
    captured.ctx = ctx;
    ctx.onCommand?.({ tool: 'nuclei', command: '/opt/secora-tools/bin/nuclei', argv: ['-u', 'https://93.184.216.34'] });
    return options.runResult ?? { exitCode: 0, stdout: '', timedOut: false };
  });
  const registry = {
    resolveRunner: jest.fn(() => ({ scanner: 'NUCLEI', run })),
    resolveNormalizer: jest.fn(() => ({ normalize })),
  };

  const probeStage = {
    resolvePin: jest.fn(options.resolvePin ?? (async () => pin)),
    run: jest.fn(async (input: { onLog: (level: string, message: string) => void; onCommand?: (i: { tool: string; command: string; argv: string[] }) => void }) => {
      input.onCommand?.({ tool: 'httpx', command: 'httpx', argv: ['-u', 'http://93.184.216.34'] });
      return options.probe ?? { outcome: 'OK', liveUrls: ['https://shop.example.org'] };
    }),
  };
  const commandAudit = { record: jest.fn(async () => undefined) };

  const configValues: Record<string, unknown> = {
    VULN_JOB_RETRY_BASE_DELAY_MS: 5000,
    VULN_JOB_RETRY_MAX_DELAY_MS: 120000,
    SCAN_DEEP_PROFILE_ENABLED: options.deepEnabled ?? false,
  };

  const moduleRef = await compileTransactionalTestingModule([
    VulnScanJobExecutionService,
    { provide: VULN_SCAN_JOBS_REPOSITORY, useValue: jobsRepository },
    { provide: VULN_SCAN_JOB_TOOL_RUNS_REPOSITORY, useValue: toolRunsRepository },
    { provide: VULN_SCAN_JOB_LOGS_REPOSITORY, useValue: logsRepository },
    { provide: VULN_FINDINGS_REPOSITORY, useValue: findingsRepository },
    { provide: TARGETS_REPOSITORY, useValue: targetsRepository },
    { provide: EVIDENCE_REPOSITORY, useValue: evidenceRepository },
    { provide: ScannerRunnerRegistry, useValue: registry },
    { provide: PipelineProbeStage, useValue: probeStage },
    { provide: ScanCommandAudit, useValue: commandAudit },
    { provide: ConfigService, useValue: { get: jest.fn((key: string) => configValues[key]) } },
    { provide: EventBus, useValue: { publish: jest.fn() } },
  ]);

  const execute = (signal = new AbortController().signal) =>
    moduleRef.get(VulnScanJobExecutionService).execute(job, signal);
  return { execute, job, logs, captured, jobsRepository, toolRunsRepository, probeStage, commandAudit, registry, run, normalize };
}

const messages = (logs: { message: string }[]) => logs.map((l) => l.message);

describe('VulnScanJobExecutionService — profile pipeline (recon -> scan)', () => {
  it('runs recon, then hands nuclei the pin, the live URLs and the profile', async () => {
    const h = await harness({ config: { profile: 'QUICK' } });
    await h.execute();

    expect(h.probeStage.resolvePin).toHaveBeenCalledWith('shop.example.org');
    const nuclei = h.captured.ctx?.config?.NUCLEI as Record<string, unknown>;
    expect(nuclei).toMatchObject({ profile: 'QUICK', pin, urls: ['https://shop.example.org'] });
    expect(messages(h.logs)).toEqual(
      expect.arrayContaining(['Resolved shop.example.org -> 93.184.216.34 (pinned for this scan).', '[stage] scan start', '[stage] scan done']),
    );
    expect(h.jobsRepository.markCompleted).toHaveBeenCalled();
  });

  it('audits every executed command with its stage and profile', async () => {
    const h = await harness({ config: { profile: 'STANDARD' } });
    await h.execute();

    expect(h.commandAudit.record).toHaveBeenCalledTimes(2);
    expect(h.commandAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({ tool: 'httpx', stage: 'recon', profile: 'STANDARD', userId: 'user-1', workspaceId: 'ws-1', jobId: 'job-1' }),
    );
    expect(h.commandAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({ tool: 'nuclei', stage: 'scan', profile: 'STANDARD', argv: ['-u', 'https://93.184.216.34'] }),
    );
  });

  it('shows findings with the real hostname, not the pinned IP', async () => {
    const h = await harness({
      config: { profile: 'QUICK' },
      runResult: { exitCode: 0, stdout: '{"matched-at":"https://93.184.216.34/.env","ip":"93.184.216.34"}', timedOut: false },
    });
    await h.execute();
    expect(h.normalize).toHaveBeenCalledWith(
      '{"matched-at":"https://shop.example.org/.env","ip":"shop.example.org"}',
      expect.anything(),
    );
  });

  it('skips the scan stage when recon found nothing live, without running nuclei', async () => {
    const h = await harness({ config: { profile: 'QUICK' }, probe: { outcome: 'OK', liveUrls: [] } });
    await h.execute();

    expect(h.run).not.toHaveBeenCalled();
    expect(messages(h.logs)).toContain('[stage] scan skipped');
    expect(h.toolRunsRepository.markComplete).toHaveBeenCalledWith(
      'tr-1',
      expect.objectContaining({ status: 'COMPLETED', findingsCount: 0 }),
    );
    expect(h.jobsRepository.markCompleted).toHaveBeenCalled();
  });

  it('fails the job without running any tool when the host resolves to a private address', async () => {
    const h = await harness({
      config: { profile: 'QUICK' },
      resolvePin: async () => {
        throw new PinBlockedError('PRIVATE_ADDRESS', 'shop.example.org resolves to a private, internal or reserved address.');
      },
    });
    await h.execute();

    expect(h.probeStage.run).not.toHaveBeenCalled();
    expect(h.run).not.toHaveBeenCalled();
    expect(h.jobsRepository.markFailed).toHaveBeenCalledWith('job-1', expect.stringContaining('private, internal or reserved'));
  });

  it('refuses the DEEP profile unless the deployment enables it', async () => {
    const off = await harness({ config: { profile: 'DEEP' }, deepEnabled: false });
    await off.execute();
    expect(off.jobsRepository.markFailed).toHaveBeenCalledWith('job-1', expect.stringContaining('DEEP'));
    expect(off.probeStage.run).not.toHaveBeenCalled();

    const on = await harness({ config: { profile: 'DEEP', deepConfirmed: true }, deepEnabled: true });
    await on.execute();
    expect(on.probeStage.run).toHaveBeenCalled();
  });

  it('never runs a DEEP job that was not confirmed at creation', async () => {
    const h = await harness({ config: { profile: 'DEEP' }, deepEnabled: true });
    await h.execute();
    expect(h.jobsRepository.markFailed).toHaveBeenCalledWith('job-1', expect.stringContaining('not confirmed'));
    expect(h.probeStage.run).not.toHaveBeenCalled();
  });

  it('keeps partial results when the scan stage hits its own time limit', async () => {
    const h = await harness({
      config: { profile: 'QUICK' },
      runResult: { exitCode: null, stdout: '', timedOut: true },
    });
    await h.execute();

    expect(messages(h.logs).some((m) => m.includes('limit; the results below are partial'))).toBe(true);
    expect(h.toolRunsRepository.markComplete).toHaveBeenCalledWith('tr-1', expect.objectContaining({ status: 'COMPLETED' }));
  });

  it('a plain job without a profile does not touch the pipeline', async () => {
    const h = await harness({ config: null });
    await h.execute();
    expect(h.probeStage.resolvePin).not.toHaveBeenCalled();
    expect(h.probeStage.run).not.toHaveBeenCalled();
    expect(h.run).toHaveBeenCalled();
    expect((h.captured.ctx?.config as unknown) ?? null).toBeNull();
  });
});
