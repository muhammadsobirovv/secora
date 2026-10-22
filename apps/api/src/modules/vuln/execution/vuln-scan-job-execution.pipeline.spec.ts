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
import {
  PipelineOrchestrator,
  type PipelineHost,
  type PipelineRunInput,
} from '../pipeline/pipeline-orchestrator.service.js';
import { OwnershipScopeService } from '../pipeline/ownership-scope.service.js';
import { makeFinding } from '../pipeline/stage-findings.js';
import type { ScannerRunContext } from '../scanner-runners/scanner-runner.interface.js';
import type { VulnScanJob, VulnScanJobToolRun } from '../../../prisma-types.js';

const pin: PinnedHost = { host: 'shop.example.org', ip: '93.184.216.34', family: 4 };
const apexRule = { root: 'shop.example.org', includeSubdomains: true };
const hostRule = { root: 'shop.example.org', includeSubdomains: false };

function buildJob(config: Record<string, unknown> | null, scanners: string[]) {
  const toolRuns = scanners.map(
    (scanner, index) => ({ id: `tr-${index + 1}`, jobId: 'job-1', scanner, status: 'PENDING' }) as VulnScanJobToolRun,
  );
  return {
    id: 'job-1',
    workspaceId: 'ws-1',
    projectId: 'proj-1',
    targetId: 'target-1',
    scanners,
    config,
    status: 'RUNNING',
    retryCount: 0,
    maxRetries: 0,
    timeoutSeconds: 1800,
    requestedBy: 'user-1',
    toolRuns,
  } as unknown as VulnScanJob & { toolRuns: VulnScanJobToolRun[] };
}

type OrchestratorBehaviour = (input: PipelineRunInput) => Promise<void>;

async function harness(options: {
  config: Record<string, unknown> | null;
  scanners?: string[];
  deepEnabled?: boolean;
  rule?: typeof apexRule;
  resolvePin?: () => Promise<PinnedHost>;
  runResult?: { exitCode: number | null; stdout: string; timedOut: boolean };
  orchestrate?: OrchestratorBehaviour;
  jobState?: { cancelRequestedAt?: Date | null; pauseRequestedAt?: Date | null };
}) {
  const job = buildJob(options.config, options.scanners ?? ['SECORA_CHECKS', 'NUCLEI']);
  const logs: { level: string; message: string }[] = [];
  const captured: { ctx?: ScannerRunContext } = {};

  const jobsRepository = {
    findById: jest.fn(async () => ({
      ...job,
      cancelRequestedAt: options.jobState?.cancelRequestedAt ?? null,
      pauseRequestedAt: options.jobState?.pauseRequestedAt ?? null,
    })),
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
    upsertMany: jest.fn(async (inputs: { scanner: string }[]) =>
      inputs.map((input, index) => ({ finding: { id: `f-${index}`, severity: 'LOW', scanner: input.scanner }, wasCreated: true })),
    ),
    list: jest.fn(async () => []),
  };
  const targetsRepository = {
    findById: jest.fn(async () => ({ id: 'target-1', projectId: 'proj-1', type: 'DOMAIN', value: 'shop.example.org' })),
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
  const probeStage = { resolvePin: jest.fn(options.resolvePin ?? (async () => pin)), run: jest.fn() };
  const commandAudit = { record: jest.fn(async () => undefined) };
  const ownershipScope = { ruleFor: jest.fn(async () => options.rule ?? hostRule) };
  const orchestrator = { run: jest.fn(options.orchestrate ?? (async () => undefined)) };

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
    { provide: PipelineOrchestrator, useValue: orchestrator },
    { provide: OwnershipScopeService, useValue: ownershipScope },
    { provide: ConfigService, useValue: { get: jest.fn((key: string) => configValues[key]) } },
    { provide: EventBus, useValue: { publish: jest.fn() } },
  ]);

  const execute = (signal = new AbortController().signal) =>
    moduleRef.get(VulnScanJobExecutionService).execute(job, signal);
  return {
    execute,
    job,
    logs,
    captured,
    jobsRepository,
    toolRunsRepository,
    findingsRepository,
    evidenceRepository,
    probeStage,
    commandAudit,
    ownershipScope,
    orchestrator,
    registry,
    run,
    normalize,
  };
}

const messages = (logs: { message: string }[]) => logs.map((l) => l.message);
const hostOf = (h: Awaited<ReturnType<typeof harness>>): PipelineHost =>
  (h.orchestrator.run.mock.calls[0][0] as PipelineRunInput).host;

describe('VulnScanJobExecutionService — profile jobs hand their stages to the orchestrator', () => {
  it('resolves the host once, looks up what the ownership proof covers, and runs the orchestrator', async () => {
    const h = await harness({ config: { profile: 'STANDARD' }, rule: apexRule });
    await h.execute();

    expect(h.probeStage.resolvePin).toHaveBeenCalledTimes(1);
    expect(h.probeStage.resolvePin).toHaveBeenCalledWith('shop.example.org');
    expect(h.ownershipScope.ruleFor).toHaveBeenCalledWith(expect.objectContaining({ id: 'target-1', type: 'DOMAIN' }), 'shop.example.org');
    expect(h.orchestrator.run).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: 'STANDARD',
        pin,
        rule: apexRule,
        target: { id: 'target-1', type: 'DOMAIN', value: 'shop.example.org' },
      }),
    );
    expect(messages(h.logs)).toEqual(
      expect.arrayContaining([
        'Resolved shop.example.org -> 93.184.216.34 (pinned for this scan).',
        'Scope: shop.example.org and its subdomains (DNS ownership proof).',
      ]),
    );
    expect(h.jobsRepository.markCompleted).toHaveBeenCalled();
  });

  it('says plainly when the ownership proof covers the host only', async () => {
    const h = await harness({ config: { profile: 'STANDARD' }, rule: hostRule });
    await h.execute();
    expect(messages(h.logs)).toContain(
      'Scope: shop.example.org only (the ownership proof covers this host, not its subdomains).',
    );
  });

  it('a stage that throws inside the orchestrator is not swallowed silently: the job takes the retry/fail path', async () => {
    const h = await harness({
      config: { profile: 'STANDARD' },
      orchestrate: async () => {
        throw new Error('proxy could not start');
      },
    });
    await h.execute();
    expect(h.jobsRepository.markFailed).toHaveBeenCalledWith('job-1', 'proxy could not start');
  });

  it('fails the job without running any tool when the host resolves to a private address', async () => {
    const h = await harness({
      config: { profile: 'STANDARD' },
      resolvePin: async () => {
        throw new PinBlockedError('PRIVATE_ADDRESS', 'shop.example.org resolves to a private, internal or reserved address.');
      },
    });
    await h.execute();

    expect(h.orchestrator.run).not.toHaveBeenCalled();
    expect(h.run).not.toHaveBeenCalled();
    expect(h.jobsRepository.markFailed).toHaveBeenCalledWith('job-1', expect.stringContaining('private, internal or reserved'));
  });

  it('refuses the DEEP profile unless the deployment enables it', async () => {
    const off = await harness({ config: { profile: 'DEEP', deepConfirmed: true }, deepEnabled: false });
    await off.execute();
    expect(off.jobsRepository.markFailed).toHaveBeenCalledWith('job-1', expect.stringContaining('DEEP'));
    expect(off.orchestrator.run).not.toHaveBeenCalled();

    const on = await harness({ config: { profile: 'DEEP', deepConfirmed: true }, deepEnabled: true });
    await on.execute();
    expect(on.orchestrator.run).toHaveBeenCalledWith(expect.objectContaining({ profile: 'DEEP' }));
  });

  it('never runs a DEEP job that was not confirmed at creation', async () => {
    const h = await harness({ config: { profile: 'DEEP' }, deepEnabled: true });
    await h.execute();
    expect(h.jobsRepository.markFailed).toHaveBeenCalledWith('job-1', expect.stringContaining('not confirmed'));
    expect(h.orchestrator.run).not.toHaveBeenCalled();
  });

  it('a plain job without a profile does not touch the pipeline', async () => {
    const h = await harness({ config: null, scanners: ['NUCLEI'] });
    await h.execute();
    expect(h.probeStage.resolvePin).not.toHaveBeenCalled();
    expect(h.orchestrator.run).not.toHaveBeenCalled();
    expect(h.run).toHaveBeenCalled();
    expect((h.captured.ctx?.config as unknown) ?? null).toBeNull();
  });
});

describe('the host the orchestrator is given', () => {
  it('runs nuclei with the pin, the URLs and the profile, audits it, and shows the real hostname', async () => {
    let nucleiResult: unknown;
    const h = await harness({
      config: { profile: 'STANDARD' },
      runResult: { exitCode: 0, stdout: '{"matched-at":"https://93.184.216.34/.env","ip":"93.184.216.34"}', timedOut: false },
      orchestrate: async (input) => {
        nucleiResult = await input.host.runNuclei({
          profile: 'STANDARD',
          pin,
          urls: ['https://shop.example.org/', 'https://shop.example.org/a?b=1'],
          proxyUrl: null,
          signal: input.signal,
        });
      },
    });
    await h.execute();

    expect((h.captured.ctx?.config?.NUCLEI as Record<string, unknown>)).toMatchObject({
      profile: 'STANDARD',
      pin,
      urls: ['https://shop.example.org/', 'https://shop.example.org/a?b=1'],
    });
    expect(h.normalize).toHaveBeenCalledWith('{"matched-at":"https://shop.example.org/.env","ip":"shop.example.org"}', expect.anything());
    expect(h.commandAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({ tool: 'nuclei', stage: 'scan', profile: 'STANDARD', userId: 'user-1', workspaceId: 'ws-1', jobId: 'job-1' }),
    );
    expect(nucleiResult).toEqual({ failed: false, partial: false, message: null });
  });

  it('reports a partial result when nuclei hits its own time limit, and keeps what it found', async () => {
    let nucleiResult: { partial?: boolean } | undefined;
    const h = await harness({
      config: { profile: 'STANDARD' },
      runResult: { exitCode: null, stdout: '', timedOut: true },
      orchestrate: async (input) => {
        nucleiResult = await input.host.runNuclei({ profile: 'STANDARD', pin, urls: ['https://shop.example.org/'], proxyUrl: null, signal: input.signal });
      },
    });
    await h.execute();
    expect(nucleiResult?.partial).toBe(true);
    expect(messages(h.logs).some((m) => m.includes('limit; the results below are partial'))).toBe(true);
    expect(h.toolRunsRepository.markComplete).toHaveBeenCalledWith('tr-2', expect.objectContaining({ status: 'COMPLETED' }));
  });

  it('persist saves findings and raw output on the scanner tool run, once', async () => {
    const finding = makeFinding({
      title: 'Missing CSP',
      description: 'd',
      severity: 'LOW',
      vulnType: 'header-csp-missing',
      signature: 'sig',
      path: '/',
      matchedAt: 'https://shop.example.org',
      remediation: 'Add a CSP.',
      evidence: { response: 'HTTP 200' },
    });
    const h = await harness({
      config: { profile: 'QUICK' },
      scanners: ['SECORA_CHECKS'],
      orchestrate: async (input) => {
        await input.host.persist('SECORA_CHECKS', { findings: [finding], raw: 'raw output' });
        await input.host.persist('SECORA_CHECKS', { findings: [finding], raw: 'raw output' });
        await input.host.persist('NAABU', { findings: [finding], raw: 'x' }); // the job has no NAABU tool run
      },
    });
    await h.execute();

    expect(h.findingsRepository.upsertMany).toHaveBeenCalledTimes(1);
    const saved = (h.findingsRepository.upsertMany.mock.calls[0][0] as unknown as Record<string, unknown>[])[0];
    expect(saved).toMatchObject({ scanner: 'SECORA_CHECKS', title: 'Missing CSP', data: { remediation: 'Add a CSP.' } });
    expect(h.toolRunsRepository.markComplete).toHaveBeenCalledWith(
      'tr-1',
      expect.objectContaining({ status: 'COMPLETED', findingsCount: 1 }),
    );
    expect(messages(h.logs).some((m) => m.startsWith('No NAABU tool run exists'))).toBe(true);
  });

  it('closeToolRun closes a skipped or failed stage once and never reopens a finished one', async () => {
    const h = await harness({
      config: { profile: 'STANDARD' },
      orchestrate: async (input) => {
        await input.host.closeToolRun('NUCLEI', 'FAILED', 'nuclei crashed');
        await input.host.closeToolRun('NUCLEI', 'COMPLETED', 'again');
        await input.host.closeToolRun('DALFOX', 'FAILED', 'no such tool run');
      },
    });
    await h.execute();
    expect(h.toolRunsRepository.markComplete).toHaveBeenCalledTimes(1);
    expect(h.toolRunsRepository.markComplete).toHaveBeenCalledWith(
      'tr-2',
      expect.objectContaining({ status: 'FAILED', errorMessage: 'nuclei crashed' }),
    );
  });

  it('tracks tool run status from the job and updates it as stages finish', async () => {
    const seen: (string | null)[] = [];
    const h = await harness({
      config: { profile: 'STANDARD' },
      orchestrate: async (input) => {
        seen.push(input.host.toolRunStatus('SECORA_CHECKS'), input.host.toolRunStatus('DALFOX'));
        await input.host.persist('SECORA_CHECKS', { findings: [], raw: '' });
        seen.push(input.host.toolRunStatus('SECORA_CHECKS'));
      },
    });
    await h.execute();
    expect(seen).toEqual(['PENDING', null, 'COMPLETED']);
  });

  it('audit records the stage the orchestrator names', async () => {
    const h = await harness({
      config: { profile: 'DEEP', deepConfirmed: true },
      deepEnabled: true,
      orchestrate: async (input) => {
        input.host.audit({ tool: 'katana', command: '/opt/secora-tools/bin/katana', argv: ['-u', 'https://shop.example.org', '-proxy', 'http://127.0.0.1:1'] }, 'crawl');
      },
    });
    await h.execute();
    expect(h.commandAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({ tool: 'katana', stage: 'crawl', profile: 'DEEP' }),
    );
  });

  it('log lines are written in the order they were produced', async () => {
    const h = await harness({
      config: { profile: 'STANDARD' },
      orchestrate: async (input) => {
        for (const stage of ['recon', 'checks', 'crawl']) {
          input.host.log('INFO', `[stage] ${stage} start`);
          input.host.log('INFO', `[stage] ${stage} done`);
        }
        await input.host.persist('SECORA_CHECKS', { findings: [], raw: '' });
      },
    });
    await h.execute();
    const stageLines = messages(h.logs).filter((m) => m.startsWith('[stage]'));
    expect(stageLines).toEqual([
      '[stage] recon start',
      '[stage] recon done',
      '[stage] checks start',
      '[stage] checks done',
      '[stage] crawl start',
      '[stage] crawl done',
    ]);
  });

  it('shouldStop is true once a pause or cancel was requested', async () => {
    const answers: boolean[] = [];
    const none = await harness({
      config: { profile: 'STANDARD' },
      orchestrate: async (input) => void answers.push(await input.host.shouldStop()),
    });
    await none.execute();
    const paused = await harness({
      config: { profile: 'STANDARD' },
      jobState: { pauseRequestedAt: new Date() },
      orchestrate: async (input) => void answers.push(await input.host.shouldStop()),
    });
    await paused.execute();
    const cancelled = await harness({
      config: { profile: 'STANDARD' },
      jobState: { cancelRequestedAt: new Date() },
      orchestrate: async (input) => void answers.push(await input.host.shouldStop()),
    });
    await cancelled.execute();
    expect(answers).toEqual([false, true, true]);
    expect(paused.jobsRepository.markPaused).toHaveBeenCalled();
    expect(cancelled.jobsRepository.markCancelled).toHaveBeenCalled();
  });
});
