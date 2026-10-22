import { Injectable, Inject, Logger } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { Transactional } from '@nestjs-cls/transactional';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../../config/env.validation.js';
import {
  TARGETS_REPOSITORY,
  type TargetsRepository,
} from '../../targets/domain/repositories/targets.repository.interface.js';
import {
  EVIDENCE_REPOSITORY,
  type EvidenceRepository,
} from '../../evidence/domain/repositories/evidence.repository.interface.js';
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
import type { VulnScanJobWithToolRuns } from '../domain/repositories/vuln-scan-jobs.repository.interface.js';
import type { UpsertFindingEvidenceRefs } from '../domain/repositories/vuln-findings.repository.interface.js';
import { ScannerRunnerRegistry } from '../scanner-runners/scanner-runner-registry.service.js';
import type { ScannerRunTarget } from '../scanner-runners/scanner-runner.interface.js';
import type { VulnFindingInput } from '../scanner-runners/normalizers/normalizer.interface.js';
import {
  VulnScanJobCancelledEvent,
  VulnScanJobCompletedEvent,
  VulnScanJobFailedEvent,
  VulnScanJobPausedEvent,
  VulnScanJobStartedEvent,
} from '../events/vuln-scan-job-events.js';
import {
  VulnFindingCreatedEvent,
  VulnFindingUpdatedEvent,
} from '../events/vuln-finding-events.js';
import type { VulnScanJobToolRun } from '../../../prisma-types.js';
import type { PipelineStage } from '@pentesthub/shared';
import { PipelineProbeStage } from '../pipeline/probe-stage.service.js';
import { ScanCommandAudit } from '../pipeline/scan-command-audit.service.js';
import { PinBlockedError, type PinnedHost } from '../pipeline/pin.util.js';
import {
  PipelineOrchestrator,
  type NucleiStageResult,
  type PipelineHost,
} from '../pipeline/pipeline-orchestrator.service.js';
import { OwnershipScopeService } from '../pipeline/ownership-scope.service.js';
import type { ScopeRule } from '../pipeline/scope.util.js';
import {
  NUCLEI_PROFILES,
  SCAN_PROFILES,
  type NucleiProfile,
  type ScanProfile,
} from '../pipeline/tool-catalog.js';

/// What a profile run needs before its stages start: the host, resolved once,
/// and what the ownership proof lets the scan touch.
interface ProfileRun {
  profile: ScanProfile;
  pin: PinnedHost;
  rule: ScopeRule;
}

/// What the nuclei (scan) stage is handed by the orchestrator.
interface NucleiStageInput {
  profile: NucleiProfile;
  pin: PinnedHost;
  urls: string[];
  proxyUrl: string | null;
}

/// The orchestrator for one claimed job: Target -> [ScannerRunner ->
/// Normalizer -> Deduplication -> Evidence] per scanner, sequentially ->
/// Activity Timeline. Owns none of the process-level concerns (claiming,
/// concurrency cap, timeout arming, cancel/pause polling, heartbeat) —
/// those belong to VulnScanJobPollerService, which passes in an
/// already-claimed job and an AbortSignal it controls. Mirrors
/// ReconJobExecutionService (Module 3) exactly except: (a) no
/// materializeScreenshots step (no v1 scanner produces an image), and (b)
/// the pause gate below, which Module 3 never needed.
@Injectable()
export class VulnScanJobExecutionService {
  private readonly logger = new Logger(VulnScanJobExecutionService.name);

  constructor(
    @Inject(VULN_SCAN_JOBS_REPOSITORY)
    private readonly jobsRepository: VulnScanJobsRepository,
    @Inject(VULN_SCAN_JOB_TOOL_RUNS_REPOSITORY)
    private readonly toolRunsRepository: VulnScanJobToolRunsRepository,
    @Inject(VULN_SCAN_JOB_LOGS_REPOSITORY)
    private readonly logsRepository: VulnScanJobLogsRepository,
    @Inject(VULN_FINDINGS_REPOSITORY)
    private readonly findingsRepository: VulnFindingsRepository,
    @Inject(TARGETS_REPOSITORY)
    private readonly targetsRepository: TargetsRepository,
    @Inject(EVIDENCE_REPOSITORY)
    private readonly evidenceRepository: EvidenceRepository,
    private readonly scannerRunnerRegistry: ScannerRunnerRegistry,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly eventBus: EventBus,
    private readonly probeStage: PipelineProbeStage,
    private readonly commandAudit: ScanCommandAudit,
    private readonly orchestrator: PipelineOrchestrator,
    private readonly ownershipScope: OwnershipScopeService,
  ) {}

  /// Runs every PENDING tool run for this job in sequence, then finalizes
  /// job-level status. Never throws — a job-level problem (target
  /// missing, uncaught exception) is caught and turned into a retry/fail
  /// transition instead of propagating to the poller.
  async execute(
    job: VulnScanJobWithToolRuns,
    signal: AbortSignal,
  ): Promise<void> {
    this.eventBus.publish(
      new VulnScanJobStartedEvent(job.workspaceId, job.projectId, null, job.id),
    );

    try {
      const target = await this.targetsRepository.findById(job.targetId);
      if (!target) {
        await this.finalizeAsFailed(job, 'Target no longer exists.');
        return;
      }

      const profileRun = await this.prepareProfile(job, target, signal);
      if (profileRun === 'FAILED') return;

      if (profileRun) {
        // A profile job: the orchestrator runs its stages in order. A stage
        // that fails does not stop the ones after it.
        await this.orchestrator.run({
          profile: profileRun.profile,
          target: { id: target.id, type: target.type, value: target.value },
          rule: profileRun.rule,
          pin: profileRun.pin,
          signal,
          host: this.buildPipelineHost(job, target, profileRun, signal),
        });
      } else {
        for (const toolRun of job.toolRuns) {
          if (signal.aborted) break;
          if (toolRun.status !== 'PENDING') continue;

          // Pause is graceful: checked BETWEEN scanners, never mid-run —
          // unlike cancel/timeout, pause never aborts a scanner that's
          // already started (see VulnScanJobStatus schema comment).
          const fresh = await this.jobsRepository.findById(job.id);
          if (fresh?.pauseRequestedAt) break;

          const scanTarget = { id: target.id, type: target.type, value: target.value };
          await this.runOneScanner(job, toolRun, scanTarget, signal, null);
        }
      }

      const fresh = await this.jobsRepository.findById(job.id);

      if (fresh?.cancelRequestedAt) {
        // cancelIfPending (StopVulnScanJobCommand) only handles
        // PENDING->CANCELLED; a job that was RUNNING/RETRYING/PAUSED when
        // cancelled only got cancelRequestedAt set, so this is the one
        // place that performs the actual status transition for that path.
        await this.jobsRepository.markCancelled(job.id);
        this.eventBus.publish(
          new VulnScanJobCancelledEvent(
            job.workspaceId,
            job.projectId,
            null,
            job.id,
          ),
        );
        return;
      }

      if (fresh?.pauseRequestedAt) {
        await this.jobsRepository.markPaused(job.id);
        this.eventBus.publish(
          new VulnScanJobPausedEvent(
            job.workspaceId,
            job.projectId,
            null,
            job.id,
          ),
        );
        return;
      }

      if (signal.aborted) {
        await this.retryOrFail(job, 'Job timed out.');
        return;
      }

      await this.jobsRepository.markCompleted(job.id);
      const findingsCount = await this.countFindings(job.workspaceId, job.id);
      this.eventBus.publish(
        new VulnScanJobCompletedEvent(
          job.workspaceId,
          job.projectId,
          null,
          job.id,
          {
            findingsCount,
            scannersRun: job.scanners,
          },
        ),
      );
    } catch (error) {
      this.logger.error(`Vulnerability scan job ${job.id} failed`, error);
      await this.retryOrFail(
        job,
        error instanceof Error ? error.message : 'Unknown error.',
      );
    }
  }

  private async runOneScanner(
    job: VulnScanJobWithToolRuns,
    toolRun: VulnScanJobToolRun,
    target: ScannerRunTarget,
    signal: AbortSignal,
    pipeline: NucleiStageInput | null,
    audit: { stage: PipelineStage; profile: ScanProfile } | null = null,
  ): Promise<NucleiStageResult> {
    await this.toolRunsRepository.markStarted(toolRun.id);

    // The scan stage of a profile run: nuclei gets the pinned address, the
    // URLs the crawl found, the profile's tag ceiling and its own stage time
    // limit (on top of the job's overall timeout).
    const staged = pipeline !== null && toolRun.scanner === 'NUCLEI';
    const baseConfig = (job.config as Record<string, unknown> | null) ?? null;
    const scannerConfig = staged
      ? {
          ...(baseConfig ?? {}),
          NUCLEI: {
            ...(((baseConfig ?? {}).NUCLEI as Record<string, unknown> | undefined) ?? {}),
            profile: pipeline.profile,
            pin: pipeline.pin,
            urls: pipeline.urls,
            ...(pipeline.proxyUrl ? { proxyUrl: pipeline.proxyUrl } : {}),
          },
        }
      : baseConfig;
    const stageSeconds = staged ? NUCLEI_PROFILES[pipeline.profile].stageTimeoutSeconds : null;
    const runSignal =
      stageSeconds === null
        ? signal
        : AbortSignal.any([signal, AbortSignal.timeout(stageSeconds * 1000)]);

    try {
      const runner = this.scannerRunnerRegistry.resolveRunner(
        toolRun.scanner,
        target,
      );
      const normalizer = this.scannerRunnerRegistry.resolveNormalizer(
        toolRun.scanner,
      );

      const result = await runner.run({
        target,
        job: { id: job.id, timeoutSeconds: job.timeoutSeconds },
        config: scannerConfig,
        signal: runSignal,
        onCommand: (info) =>
          this.auditCommand(job, target, info, audit?.stage ?? 'scan', audit?.profile ?? null),
        onLog: (level, message) => {
          void this.logsRepository
            .append({ jobId: job.id, toolRunId: toolRun.id, level, message })
            .catch((err: unknown) =>
              this.logger.warn(
                `Failed to persist vuln scan log: ${String(err)}`,
              ),
            );
        },
      });

      // The stage's own time limit is not the job being cancelled: what the
      // tool found so far is kept and reported as partial.
      const stageLimitReached = result.timedOut && stageSeconds !== null && !signal.aborted;
      if (result.timedOut && !stageLimitReached) {
        await this.toolRunsRepository.markComplete(toolRun.id, {
          status: 'FAILED',
          exitCode: result.exitCode,
          findingsCount: 0,
          errorMessage: 'Timed out or cancelled.',
          rawOutputEvidenceId: null,
        });
        return { failed: true, partial: false, message: 'Timed out or cancelled.' };
      }
      if (stageLimitReached) {
        await this.logLine(
          job.id,
          toolRun.id,
          'WARN',
          `Scan stage reached its ${stageSeconds}s limit; the results below are partial.`,
        );
      }

      // A pinned run prints the IP; findings must carry the real hostname.
      const stdout = pipeline
        ? result.stdout.split(pipeline.pin.ip).join(pipeline.pin.host)
        : result.stdout;
      const findingInputs = normalizer.normalize(stdout, {
        scanner: toolRun.scanner,
        targetValue: target.value,
      });

      await this.persistToolResult(job, toolRun, findingInputs, stdout);
      return { failed: false, partial: stageLimitReached, message: null };
    } catch (error) {
      this.logger.warn(
        `Scanner ${toolRun.scanner} failed for job ${job.id}: ${String(error)}`,
      );
      await this.toolRunsRepository.markComplete(toolRun.id, {
        status: 'FAILED',
        exitCode: null,
        findingsCount: 0,
        errorMessage: error instanceof Error ? error.message : 'Unknown error.',
        rawOutputEvidenceId: null,
      });
      return {
        failed: true,
        partial: false,
        message: error instanceof Error ? error.message : 'Unknown error.',
      };
    }
  }

  /// The orchestrator's view of this job: logging, audit, persistence of a
  /// stage's findings and the nuclei run. Log lines are written in order, so
  /// the stage markers the stepper reads always arrive in the order they
  /// were produced.
  private buildPipelineHost(
    job: VulnScanJobWithToolRuns,
    target: { id: string; type: string; value: string },
    run: ProfileRun,
    signal: AbortSignal,
  ): PipelineHost {
    const statuses = new Map<string, string>(job.toolRuns.map((toolRun) => [toolRun.scanner, toolRun.status]));
    const toolRunFor = (scanner: string) => job.toolRuns.find((toolRun) => toolRun.scanner === scanner);
    let logChain: Promise<void> = Promise.resolve();

    return {
      log: (level, message) => {
        logChain = logChain.then(() => this.logLine(job.id, null, level, message));
      },
      audit: (info, stage) => this.auditCommand(job, target, info, stage, run.profile),
      toolRunStatus: (scanner) => statuses.get(scanner) ?? null,
      persist: async (scanner, result) => {
        const toolRun = toolRunFor(scanner);
        if (!toolRun) {
          await this.logLine(job.id, null, 'WARN', `No ${scanner} tool run exists for this job; its ${result.findings.length} finding(s) were not saved.`);
          return;
        }
        if (statuses.get(scanner) === 'COMPLETED') return;
        await this.toolRunsRepository.markStarted(toolRun.id);
        await logChain;
        await this.persistToolResult(job, toolRun, result.findings, result.raw);
        statuses.set(scanner, 'COMPLETED');
      },
      closeToolRun: async (scanner, outcome, message) => {
        const toolRun = toolRunFor(scanner);
        if (!toolRun || statuses.get(scanner) === 'COMPLETED' || statuses.get(scanner) === 'FAILED') return;
        await this.toolRunsRepository.markStarted(toolRun.id);
        await this.toolRunsRepository.markComplete(toolRun.id, {
          status: outcome,
          exitCode: outcome === 'COMPLETED' ? 0 : null,
          findingsCount: 0,
          errorMessage: message,
          rawOutputEvidenceId: null,
        });
        statuses.set(scanner, outcome);
      },
      runNuclei: async (input) => {
        const toolRun = toolRunFor('NUCLEI');
        if (!toolRun) {
          return { failed: true, partial: false, message: 'This job has no NUCLEI tool run.' };
        }
        await logChain;
        const result = await this.runOneScanner(
          job,
          toolRun,
          { id: target.id, type: target.type as ScannerRunTarget['type'], value: target.value },
          input.signal,
          { profile: input.profile, pin: input.pin, urls: input.urls, proxyUrl: input.proxyUrl },
          { stage: 'scan', profile: run.profile },
        );
        statuses.set('NUCLEI', result.failed ? 'FAILED' : 'COMPLETED');
        return result;
      },
      shouldStop: async () => {
        if (signal.aborted) return true;
        const fresh = await this.jobsRepository.findById(job.id);
        return Boolean(fresh?.pauseRequestedAt || fresh?.cancelRequestedAt);
      },
    };
  }

  @Transactional()
  private async persistToolResult(
    job: VulnScanJobWithToolRuns,
    toolRun: VulnScanJobToolRun,
    findings: VulnFindingInput[],
    rawOutput: string,
  ): Promise<void> {
    // One Evidence(LOG) per tool-run, even on zero findings — the
    // traceability/audit record ("Raw Output" from the spec's Evidence
    // list), same role as Recon's per-tool-run rawOutputEvidenceId.
    const rawOutputEvidence = await this.evidenceRepository.create({
      projectId: job.projectId,
      targetId: job.targetId,
      type: 'LOG',
      title: `${toolRun.scanner} — vuln scan job ${job.id}`,
      textContent: rawOutput.slice(0, 100_000),
      createdBy: job.requestedBy,
    });

    if (findings.length > 0) {
      const upsertInputs = await Promise.all(
        findings.map(async (f) => {
          const evidenceRefs: UpsertFindingEvidenceRefs = {
            rawOutputEvidenceId: rawOutputEvidence.id,
          };
          if (f.evidence.request) {
            const e = await this.evidenceRepository.create({
              projectId: job.projectId,
              targetId: job.targetId,
              type: 'HTTP_REQUEST',
              title: `Request — ${f.title}`.slice(0, 200),
              textContent: f.evidence.request,
              createdBy: job.requestedBy,
            });
            evidenceRefs.requestEvidenceId = e.id;
          }
          if (f.evidence.response) {
            const e = await this.evidenceRepository.create({
              projectId: job.projectId,
              targetId: job.targetId,
              type: 'HTTP_RESPONSE',
              title: `Response — ${f.title}`.slice(0, 200),
              textContent: f.evidence.response,
              createdBy: job.requestedBy,
            });
            evidenceRefs.responseEvidenceId = e.id;
          }
          if (f.evidence.payload) {
            const e = await this.evidenceRepository.create({
              projectId: job.projectId,
              targetId: job.targetId,
              type: 'PAYLOAD',
              title: `Payload — ${f.title}`.slice(0, 200),
              textContent: f.evidence.payload,
              createdBy: job.requestedBy,
            });
            evidenceRefs.payloadEvidenceId = e.id;
          }
          if (f.evidence.command) {
            const e = await this.evidenceRepository.create({
              projectId: job.projectId,
              targetId: job.targetId,
              type: 'COMMAND',
              title: `Command — ${f.title}`.slice(0, 200),
              textContent: f.evidence.command,
              createdBy: job.requestedBy,
            });
            evidenceRefs.commandEvidenceId = e.id;
          }

          return {
            jobId: job.id,
            workspaceId: job.workspaceId,
            projectId: job.projectId,
            targetId: job.targetId,
            title: f.title,
            description: f.description,
            severity: f.severity,
            cvssScore: f.cvssScore,
            cvssVector: f.cvssVector,
            cwe: f.cwe,
            owaspCategory: f.owaspCategory,
            scanner: toolRun.scanner,
            scannerVersion: f.scannerVersion,
            confidence: f.confidence,
            vulnType: f.vulnType,
            path: f.path,
            signature: f.signature,
            matchedAt: f.matchedAt,
            data: f.data,
            dedupKey: f.dedupKey,
            tags: f.tags,
            references: f.references,
            createdBy: job.requestedBy,
            ...evidenceRefs,
          };
        }),
      );

      const upserted = await this.findingsRepository.upsertMany(upsertInputs);
      for (const { finding, wasCreated } of upserted) {
        this.eventBus.publish(
          wasCreated
            ? new VulnFindingCreatedEvent(
                job.workspaceId,
                job.projectId,
                job.requestedBy,
                finding.id,
                { severity: finding.severity, scanner: finding.scanner },
              )
            : new VulnFindingUpdatedEvent(
                job.workspaceId,
                job.projectId,
                job.requestedBy,
                finding.id,
                { severity: finding.severity, scanner: finding.scanner },
              ),
        );
      }
    }

    await this.toolRunsRepository.markComplete(toolRun.id, {
      status: 'COMPLETED',
      exitCode: 0,
      findingsCount: findings.length,
      errorMessage: null,
      rawOutputEvidenceId: rawOutputEvidence.id,
    });
  }

  private async retryOrFail(
    job: VulnScanJobWithToolRuns,
    error: string,
  ): Promise<void> {
    const maxRetries = job.maxRetries;
    if (job.retryCount < maxRetries) {
      const baseDelay = this.configService.get('VULN_JOB_RETRY_BASE_DELAY_MS', {
        infer: true,
      });
      const maxDelay = this.configService.get('VULN_JOB_RETRY_MAX_DELAY_MS', {
        infer: true,
      });
      const retryCount = job.retryCount + 1;
      const backoff = Math.min(baseDelay * 2 ** retryCount, maxDelay);
      const jitter = Math.random() * 2000;
      await this.jobsRepository.scheduleRetry(job.id, {
        retryCount,
        nextAttemptAt: new Date(Date.now() + backoff + jitter),
        error,
      });
      return;
    }

    await this.jobsRepository.markFailed(job.id, error);
    this.eventBus.publish(
      new VulnScanJobFailedEvent(job.workspaceId, job.projectId, null, job.id, {
        error,
      }),
    );
  }

  private async finalizeAsFailed(
    job: VulnScanJobWithToolRuns,
    error: string,
  ): Promise<void> {
    await this.jobsRepository.markFailed(job.id, error);
    this.eventBus.publish(
      new VulnScanJobFailedEvent(job.workspaceId, job.projectId, null, job.id, {
        error,
      }),
    );
  }

  private resolveProfile(job: VulnScanJobWithToolRuns): ScanProfile | null {
    const raw = (job.config as Record<string, unknown> | null)?.profile;
    return typeof raw === 'string' && (SCAN_PROFILES as readonly string[]).includes(raw)
      ? (raw as ScanProfile)
      : null;
  }

  /// Profile runs only: refuses a disabled DEEP profile, resolves the target
  /// host ONCE (every address must be public) and runs the recon stage.
  /// Returns null for a plain job (no profile), 'FAILED' when the job was
  /// finalized as failed here, otherwise what the scan stage needs. If the job
  /// is cancelled or times out during recon, the usual abort handling in
  /// execute() takes over.
  private async prepareProfile(
    job: VulnScanJobWithToolRuns,
    target: { id: string; type: string; value: string },
    _signal: AbortSignal,
  ): Promise<ProfileRun | 'FAILED' | null> {
    const profile = this.resolveProfile(job);
    if (!profile) return null;

    if (profile === 'DEEP' && !this.configService.get('SCAN_DEEP_PROFILE_ENABLED', { infer: true })) {
      await this.logLine(job.id, null, 'ERROR', 'The DEEP profile is not enabled on this deployment.');
      await this.finalizeAsFailed(job, 'The DEEP profile is not enabled on this deployment.');
      return 'FAILED';
    }
    // Defense in depth: a DEEP job that was not confirmed at creation never runs.
    if (profile === 'DEEP' && (job.config as Record<string, unknown> | null)?.deepConfirmed !== true) {
      await this.logLine(job.id, null, 'ERROR', 'The DEEP profile was not confirmed for this job.');
      await this.finalizeAsFailed(job, 'The DEEP profile was not confirmed for this job.');
      return 'FAILED';
    }

    let host: string;
    try {
      host = target.type === 'URL' ? new URL(target.value).hostname : target.value;
    } catch {
      host = target.value;
    }

    let pin: PinnedHost;
    try {
      pin = await this.probeStage.resolvePin(host);
    } catch (error) {
      const message =
        error instanceof PinBlockedError
          ? `Scan refused: ${error.message}`
          : `Scan refused: ${error instanceof Error ? error.message : 'invalid target host.'}`;
      await this.logLine(job.id, null, 'ERROR', message);
      await this.finalizeAsFailed(job, message);
      return 'FAILED';
    }
    await this.logLine(job.id, null, 'INFO', `Resolved ${pin.host} -> ${pin.ip} (pinned for this scan).`);

    const rule = await this.ownershipScope.ruleFor(target, pin.host);
    await this.logLine(
      job.id,
      null,
      'INFO',
      rule.includeSubdomains
        ? `Scope: ${rule.root} and its subdomains (DNS ownership proof).`
        : `Scope: ${rule.root} only (the ownership proof covers this host, not its subdomains).`,
    );
    return { profile, pin, rule };
  }

  private logLine(
    jobId: string,
    toolRunId: string | null,
    level: Parameters<VulnScanJobLogsRepository['append']>[0]['level'],
    message: string,
  ): Promise<void> {
    return this.logsRepository.append({ jobId, toolRunId, level, message }).then(
      () => undefined,
      (err: unknown) => {
        this.logger.warn(`Failed to persist vuln scan log: ${String(err)}`);
      },
    );
  }

  private auditCommand(
    job: VulnScanJobWithToolRuns,
    target: { id: string; value: string },
    info: { tool: string; command: string; argv: string[] },
    stage: PipelineStage,
    profile: string | null,
  ): void {
    void this.commandAudit.record({
      userId: job.requestedBy,
      workspaceId: job.workspaceId,
      jobId: job.id,
      target: { id: target.id, value: target.value },
      tool: info.tool,
      stage,
      profile,
      command: info.command,
      argv: info.argv,
    });
  }

  private async countFindings(
    workspaceId: string,
    jobId: string,
  ): Promise<number> {
    const findings = await this.findingsRepository.list({
      workspaceId,
      jobId,
    });
    return findings.length;
  }
}
