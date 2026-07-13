import { Injectable, Inject, Logger } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { Transactional } from '@nestjs-cls/transactional';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import type { EnvConfig } from '../../../config/env.validation.js';
import { STORAGE_SERVICE } from '../../../common/providers/tokens.js';
import type { StorageService } from '../../../common/providers/storage/storage-service.interface.js';
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
import type { ReconJobWithToolRuns } from '../domain/repositories/recon-jobs.repository.interface.js';
import { ToolRunnerRegistry } from '../tool-runners/tool-runner-registry.service.js';
import type { ToolRunTarget } from '../tool-runners/tool-runner.interface.js';
import type { ReconFindingInput } from '../tool-runners/normalizers/normalizer.interface.js';
import {
  ReconJobCancelledEvent,
  ReconJobCompletedEvent,
  ReconJobFailedEvent,
  ReconJobStartedEvent,
} from '../events/recon-job-events.js';
import type { ReconJobToolRun, ReconTool } from '../../../prisma-types.js';

const GOWITNESS: ReconTool = 'GOWITNESS';

/// The orchestrator for one claimed job: Target -> [ToolRunner ->
/// Normalizer -> Deduplication -> Evidence] per tool, sequentially ->
/// Activity Timeline. Owns none of the process-level concerns (claiming,
/// concurrency cap, timeout arming, cancel polling) — those belong to
/// ReconJobPollerService, which passes in an already-claimed job and an
/// AbortSignal it controls. This keeps "run this job's tools" testable in
/// isolation from "decide which job to run next."
@Injectable()
export class ReconJobExecutionService {
  private readonly logger = new Logger(ReconJobExecutionService.name);

  constructor(
    @Inject(RECON_JOBS_REPOSITORY)
    private readonly jobsRepository: ReconJobsRepository,
    @Inject(RECON_JOB_TOOL_RUNS_REPOSITORY)
    private readonly toolRunsRepository: ReconJobToolRunsRepository,
    @Inject(RECON_JOB_LOGS_REPOSITORY)
    private readonly logsRepository: ReconJobLogsRepository,
    @Inject(RECON_FINDINGS_REPOSITORY)
    private readonly findingsRepository: ReconFindingsRepository,
    @Inject(TARGETS_REPOSITORY)
    private readonly targetsRepository: TargetsRepository,
    @Inject(EVIDENCE_REPOSITORY)
    private readonly evidenceRepository: EvidenceRepository,
    @Inject(ATTACHMENTS_REPOSITORY)
    private readonly attachmentsRepository: AttachmentsRepository,
    @Inject(STORAGE_SERVICE)
    private readonly storageService: StorageService,
    private readonly toolRunnerRegistry: ToolRunnerRegistry,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly eventBus: EventBus,
  ) {}

  /// Runs every PENDING tool run for this job in sequence, then finalizes
  /// job-level status. Never throws — a job-level problem (target
  /// missing, uncaught exception) is caught and turned into a retry/fail
  /// transition instead of propagating to the poller.
  async execute(job: ReconJobWithToolRuns, signal: AbortSignal): Promise<void> {
    this.eventBus.publish(
      new ReconJobStartedEvent(job.workspaceId, job.projectId, null, job.id),
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

        await this.runOneTool(
          job,
          toolRun,
          { id: target.id, type: target.type, value: target.value },
          signal,
        );
      }

      const fresh = await this.jobsRepository.findById(job.id);
      if (fresh?.cancelRequestedAt) {
        // cancelIfPending (CancelReconJobCommand) only handles
        // PENDING->CANCELLED; a job that was RUNNING/RETRYING when
        // cancelled only got cancelRequestedAt set, so this is the one
        // place that performs the actual status transition for that path.
        await this.jobsRepository.markCancelled(job.id);
        this.eventBus.publish(
          new ReconJobCancelledEvent(
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
        new ReconJobCompletedEvent(
          job.workspaceId,
          job.projectId,
          null,
          job.id,
          {
            findingsCount,
            toolsRun: job.tools,
          },
        ),
      );
    } catch (error) {
      this.logger.error(`Recon job ${job.id} failed`, error);
      await this.retryOrFail(
        job,
        error instanceof Error ? error.message : 'Unknown error.',
      );
    }
  }

  private async runOneTool(
    job: ReconJobWithToolRuns,
    toolRun: ReconJobToolRun,
    target: ToolRunTarget,
    signal: AbortSignal,
  ): Promise<void> {
    await this.toolRunsRepository.markStarted(toolRun.id);

    try {
      const runner = this.toolRunnerRegistry.resolveRunner(
        toolRun.tool,
        target,
      );
      const normalizer = this.toolRunnerRegistry.resolveNormalizer(
        toolRun.tool,
      );

      const result = await runner.run({
        target,
        job: { id: job.id, timeoutSeconds: job.timeoutSeconds },
        signal,
        onLog: (level, message) => {
          void this.logsRepository
            .append({ jobId: job.id, toolRunId: toolRun.id, level, message })
            .catch((err: unknown) =>
              this.logger.warn(`Failed to persist recon log: ${String(err)}`),
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

      let findingInputs = normalizer.normalize(result.stdout, {
        tool: toolRun.tool,
        targetValue: target.value,
      });
      findingInputs = await this.materializeScreenshots(
        findingInputs,
        job,
        target,
      );

      await this.persistToolResult(job, toolRun, findingInputs, result.stdout);
    } catch (error) {
      this.logger.warn(
        `Tool ${toolRun.tool} failed for job ${job.id}: ${String(error)}`,
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

  /// GOWITNESS's Normalizer output is provisional (data.base64 is a
  /// staging payload, not the final persisted shape — see
  /// GowitnessNormalizer). This is the one place with the DB/storage
  /// access needed to turn it into a real Evidence+Attachment pair and
  /// replace the finding's data with a pointer to them.
  private async materializeScreenshots(
    findings: ReconFindingInput[],
    job: ReconJobWithToolRuns,
    target: { id: string; value: string },
  ): Promise<ReconFindingInput[]> {
    const materialized: ReconFindingInput[] = [];
    for (const finding of findings) {
      if (finding.type !== 'SCREENSHOT' || !finding.data.base64) {
        materialized.push(finding);
        continue;
      }

      const base64 = finding.data.base64 as string;
      const fileName = (finding.data.fileName as string) ?? 'screenshot.png';
      const buffer = Buffer.from(base64, 'base64');

      const evidence = await this.evidenceRepository.create({
        projectId: job.projectId,
        targetId: target.id,
        type: 'SCREENSHOT',
        title: `Screenshot — ${finding.value}`,
        createdBy: job.requestedBy,
      });

      const key = `workspaces/${job.workspaceId}/evidence/${evidence.id}/${Date.now()}-${fileName}`;
      const { url } = await this.storageService.upload(
        key,
        buffer,
        'image/png',
      );
      const attachment = await this.attachmentsRepository.create({
        workspaceId: job.workspaceId,
        attachableType: 'EVIDENCE',
        attachableId: evidence.id,
        fileName,
        mimeType: 'image/png',
        sizeBytes: buffer.byteLength,
        storageKey: key,
        uploadedBy: job.requestedBy,
      });
      const checksum = createHash('sha256').update(buffer).digest('hex');
      await this.evidenceRepository.update(evidence.id, { checksum });

      materialized.push({
        ...finding,
        data: { evidenceId: evidence.id, attachmentId: attachment.id, url },
      });
    }
    return materialized;
  }

  @Transactional()
  private async persistToolResult(
    job: ReconJobWithToolRuns,
    toolRun: ReconJobToolRun,
    findings: ReconFindingInput[],
    rawOutput: string,
  ): Promise<void> {
    if (findings.length > 0) {
      await this.findingsRepository.upsertMany(
        findings.map((f) => ({
          jobId: job.id,
          workspaceId: job.workspaceId,
          projectId: job.projectId,
          targetId: job.targetId,
          type: f.type,
          value: f.value,
          data: f.data,
          source: toolRun.tool,
          dedupKey: f.dedupKey,
        })),
      );
    }

    // One Evidence(LOG) per tool-run, even on zero findings — the
    // traceability/audit record. GOWITNESS's own screenshot Evidence
    // already covers that tool; a redundant LOG entry for it isn't
    // useful, so it's skipped.
    let rawOutputEvidenceId: string | null = null;
    if (toolRun.tool !== GOWITNESS) {
      const evidence = await this.evidenceRepository.create({
        projectId: job.projectId,
        targetId: job.targetId,
        type: 'LOG',
        title: `${toolRun.tool} — recon job ${job.id}`,
        textContent: rawOutput.slice(0, 100_000),
        createdBy: job.requestedBy,
      });
      rawOutputEvidenceId = evidence.id;
    }

    await this.toolRunsRepository.markComplete(toolRun.id, {
      status: 'COMPLETED',
      exitCode: 0,
      findingsCount: findings.length,
      errorMessage: null,
      rawOutputEvidenceId,
    });
  }

  private async retryOrFail(
    job: ReconJobWithToolRuns,
    error: string,
  ): Promise<void> {
    const maxRetries = job.maxRetries;
    if (job.retryCount < maxRetries) {
      const baseDelay = this.configService.get(
        'RECON_JOB_RETRY_BASE_DELAY_MS',
        {
          infer: true,
        },
      );
      const maxDelay = this.configService.get('RECON_JOB_RETRY_MAX_DELAY_MS', {
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
      new ReconJobFailedEvent(job.workspaceId, job.projectId, null, job.id, {
        error,
      }),
    );
  }

  private async finalizeAsFailed(
    job: ReconJobWithToolRuns,
    error: string,
  ): Promise<void> {
    await this.jobsRepository.markFailed(job.id, error);
    this.eventBus.publish(
      new ReconJobFailedEvent(job.workspaceId, job.projectId, null, job.id, {
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
