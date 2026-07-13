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

      for (const toolRun of job.toolRuns) {
        if (signal.aborted) break;
        if (toolRun.status !== 'PENDING') continue;

        // Pause is graceful: checked BETWEEN scanners, never mid-run —
        // unlike cancel/timeout, pause never aborts a scanner that's
        // already started (see VulnScanJobStatus schema comment).
        const fresh = await this.jobsRepository.findById(job.id);
        if (fresh?.pauseRequestedAt) break;

        await this.runOneScanner(
          job,
          toolRun,
          { id: target.id, type: target.type, value: target.value },
          signal,
        );
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
  ): Promise<void> {
    await this.toolRunsRepository.markStarted(toolRun.id);

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
        config: job.config as Record<string, unknown> | null,
        signal,
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

      if (result.timedOut) {
        await this.toolRunsRepository.markComplete(toolRun.id, {
          status: 'FAILED',
          exitCode: result.exitCode,
          findingsCount: 0,
          errorMessage: 'Timed out or cancelled.',
          rawOutputEvidenceId: null,
        });
        return;
      }

      const findingInputs = normalizer.normalize(result.stdout, {
        scanner: toolRun.scanner,
        targetValue: target.value,
      });

      await this.persistToolResult(job, toolRun, findingInputs, result.stdout);
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
    }
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
