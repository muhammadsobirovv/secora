import { HttpStatus, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import type { MonitoringJobDto, MonitoringJobStatus, MonitoringTrigger, ReconTool } from '@pentesthub/shared';
import { AppException } from '../../common/exceptions/app.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PollerLeaseService } from '../../common/concurrency/poller-lease.service.js';
import { computeNextRunAt } from '../automation/scheduled-job-cron.util.js';
import { CreateReconJobCommand } from '../recon/commands/create-recon-job.command.js';

interface MonitoringJobRow {
  id: string;
  workspaceId: string;
  projectId: string;
  targetId: string;
  trigger: string;
  cronExpression: string | null;
  enabled: boolean;
  status: string;
  lastReconJobId: string | null;
  lastRunAt: Date | string | null;
  nextRunAt: Date | string | null;
  createdBy: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

function toDto(row: MonitoringJobRow): MonitoringJobDto {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    targetId: row.targetId,
    trigger: row.trigger as MonitoringTrigger,
    cronExpression: row.cronExpression,
    enabled: row.enabled,
    status: row.status as MonitoringJobStatus,
    lastReconJobId: row.lastReconJobId,
    lastRunAt: row.lastRunAt ? new Date(row.lastRunAt).toISOString() : null,
    nextRunAt: row.nextRunAt ? new Date(row.nextRunAt).toISOString() : null,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

const LEASE_NAME = 'continuous-monitoring-runner';
const LEASE_TTL_MS = 90_000;

/// Recon tool subset chosen for continuous monitoring: subdomain
/// discovery (SUBFINDER), live-host + tech-header probing (HTTPX), port
/// scan (NAABU), DNS resolution (DNSX) — the four tools whose *new*
/// findings between two runs `ChangeDetectionService` already knows how
/// to turn into `ChangeDetectionEventType.NEW_ASSET`/`NEW_TECHNOLOGY`
/// events. Deliberately excludes heavier/slower crawlers (KATANA/GAU/
/// AMASS) so a scheduled monitoring run stays fast enough to actually run
/// on a cadence — an operator who wants those can still run them manually
/// via the existing Recon Jobs UI.
const MONITORING_DEFAULT_TOOLS: ReconTool[] = ['SUBFINDER', 'HTTPX', 'NAABU', 'DNSX'];

/// Module 17 — task #463 (Continuous Attack Surface Monitoring, spec
/// section 4). `MonitoringJob` is a policy row, not a second execution
/// engine (see that model's own schema doc comment): a due/manually-
/// triggered policy is resolved into a *real* `ReconJob` through the
/// exact same `CreateReconJobCommand` the Recon Jobs UI already uses —
/// this service never talks to a ToolRunner/JobQueue directly. Once that
/// Recon job completes, the *existing* `ReconJobCompletedIntelligenceHandler`
/// (Module 16) already runs `ChangeDetectionService.diffLatestForTarget`
/// against it — this module's own event handler
/// (`MonitoringReconJobCompletedHandler`) only updates this policy row's
/// own bookkeeping (`status`/`lastRunAt`/`lastReconJobId`/`nextRunAt`), it
/// does not duplicate change-detection.
///
/// The due-job poll loop mirrors `ScheduledJobRunnerService` exactly
/// (hand-rolled `setInterval` + `PollerLeaseService.withLease` for HA
/// single-replica-per-tick safety, `computeNextRunAt` reused verbatim
/// from `automation/scheduled-job-cron.util.ts`) rather than inventing a
/// second scheduling mechanism.
@Injectable()
export class ContinuousMonitoringService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ContinuousMonitoringService.name);
  private intervalHandle: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly commandBus: CommandBus,
    private readonly leases: PollerLeaseService,
  ) {}

  onModuleInit(): void {
    this.intervalHandle = setInterval(() => {
      void this.tick();
    }, 60_000);
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) clearInterval(this.intervalHandle);
  }

  private get repo() {
    return (
      this.prisma as unknown as {
        monitoringJob: {
          create: (args: unknown) => Promise<MonitoringJobRow>;
          findMany: (args: unknown) => Promise<MonitoringJobRow[]>;
          findUnique: (args: unknown) => Promise<MonitoringJobRow | null>;
          findFirst: (args: unknown) => Promise<MonitoringJobRow | null>;
          update: (args: unknown) => Promise<MonitoringJobRow>;
          delete: (args: unknown) => Promise<MonitoringJobRow>;
        };
      }
    ).monitoringJob;
  }

  async create(
    workspaceId: string,
    userId: string,
    dto: { projectId: string; targetId: string; trigger: MonitoringTrigger; cronExpression?: string },
  ): Promise<MonitoringJobDto> {
    if (dto.trigger === 'SCHEDULED' && !dto.cronExpression) {
      throw new AppException(
        'MONITORING_JOB_CRON_REQUIRED',
        'cronExpression is required when trigger is SCHEDULED.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const existing = await this.repo.findFirst({ where: { targetId: dto.targetId, trigger: dto.trigger } });
    if (existing) {
      throw new AppException(
        'MONITORING_JOB_ALREADY_EXISTS',
        `A ${dto.trigger} monitoring job already exists for this target.`,
        HttpStatus.CONFLICT,
      );
    }

    const nextRunAt = dto.trigger === 'SCHEDULED' && dto.cronExpression ? computeNextRunAt(dto.cronExpression) : null;

    const row = await this.repo.create({
      data: {
        workspaceId,
        projectId: dto.projectId,
        targetId: dto.targetId,
        trigger: dto.trigger,
        cronExpression: dto.cronExpression ?? null,
        enabled: true,
        status: 'PENDING',
        nextRunAt,
        createdBy: userId,
      },
    });
    return toDto(row);
  }

  async listForWorkspace(workspaceId: string): Promise<MonitoringJobDto[]> {
    const rows = await this.repo.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' }, take: 200 });
    return rows.map(toDto);
  }

  async getForWorkspace(id: string, workspaceId: string): Promise<MonitoringJobDto> {
    const row = await this.requireOwnedRow(id, workspaceId);
    return toDto(row);
  }

  async update(
    id: string,
    workspaceId: string,
    dto: { enabled?: boolean; cronExpression?: string },
  ): Promise<MonitoringJobDto> {
    const existing = await this.requireOwnedRow(id, workspaceId);
    const nextRunAt =
      dto.cronExpression && existing.trigger === 'SCHEDULED' ? computeNextRunAt(dto.cronExpression) : undefined;

    const row = await this.repo.update({
      where: { id },
      data: {
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        ...(dto.cronExpression !== undefined ? { cronExpression: dto.cronExpression } : {}),
        ...(nextRunAt !== undefined ? { nextRunAt } : {}),
      },
    });
    return toDto(row);
  }

  async delete(id: string, workspaceId: string): Promise<void> {
    await this.requireOwnedRow(id, workspaceId);
    await this.repo.delete({ where: { id } });
  }

  /// Manual, immediate trigger regardless of `trigger` type — an analyst
  /// clicking "Scan now" on a policy. Fires the same dispatch path the
  /// scheduler's `runTick` uses.
  async triggerNow(id: string, userId: string, workspaceId: string): Promise<MonitoringJobDto> {
    const job = await this.requireOwnedRow(id, workspaceId);
    return this.dispatch(job, userId);
  }

  private async requireOwnedRow(id: string, workspaceId: string): Promise<MonitoringJobRow> {
    const row = await this.repo.findUnique({ where: { id } });
    if (!row || row.workspaceId !== workspaceId) {
      throw new AppException('MONITORING_JOB_NOT_FOUND', 'Monitoring job not found.', HttpStatus.NOT_FOUND);
    }
    return row;
  }

  async tick(): Promise<void> {
    await this.leases.withLease(LEASE_NAME, LEASE_TTL_MS, () => this.runTick());
  }

  private async runTick(): Promise<void> {
    const due = await this.repo.findMany({
      where: { enabled: true, trigger: 'SCHEDULED', nextRunAt: { lte: new Date() } },
      take: 50,
    });
    for (const job of due) {
      try {
        await this.dispatch(job, job.createdBy);
      } catch (error: unknown) {
        this.logger.warn(`Monitoring job ${job.id} dispatch failed: ${String(error)}`);
      }
    }
  }

  /// The one place this service ever creates a `ReconJob` — via
  /// `CreateReconJobCommand`, the platform's single canonical recon-
  /// execution entrypoint (ScopeEngine-gated, same as the manual UI
  /// path). Failure here (e.g. the target's type isn't compatible with
  /// one of the monitoring tools, or a Scope Engine denial) marks the
  /// policy FAILED and re-schedules its `nextRunAt` rather than leaving
  /// it stuck — the *next* tick gets another chance.
  private async dispatch(job: MonitoringJobRow, userId: string): Promise<MonitoringJobDto> {
    await this.repo.update({ where: { id: job.id }, data: { status: 'RUNNING' } });

    try {
      const reconJob = (await this.commandBus.execute(
        new CreateReconJobCommand(userId, job.targetId, { tools: MONITORING_DEFAULT_TOOLS }),
      )) as { id: string };

      const row = await this.repo.update({
        where: { id: job.id },
        data: {
          lastReconJobId: reconJob.id,
          lastRunAt: new Date(),
          // Left RUNNING here — `MonitoringReconJobCompletedHandler` flips
          // it to COMPLETED once the dispatched ReconJob actually
          // finishes (recon execution is async; this call only enqueues
          // it). `nextRunAt` for a SCHEDULED policy is also advanced
          // there, once the run outcome is known.
        },
      });
      return toDto(row);
    } catch (error: unknown) {
      const row = await this.repo.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          lastRunAt: new Date(),
          nextRunAt: job.trigger === 'SCHEDULED' && job.cronExpression ? computeNextRunAt(job.cronExpression) : job.nextRunAt,
        },
      });
      this.logger.warn(`Monitoring job ${job.id} failed to dispatch a recon job: ${String(error)}`);
      return toDto(row);
    }
  }

  /// Called by `MonitoringReconJobCompletedHandler` once the ReconJob
  /// this policy dispatched finishes.
  async markRunComplete(targetId: string, reconJobId: string): Promise<void> {
    const job = await this.repo.findFirst({ where: { targetId, lastReconJobId: reconJobId, status: 'RUNNING' } });
    if (!job) return; // not a recon job this monitoring policy dispatched — nothing to do
    await this.repo.update({
      where: { id: job.id },
      data: {
        status: 'COMPLETED',
        nextRunAt: job.trigger === 'SCHEDULED' && job.cronExpression ? computeNextRunAt(job.cronExpression) : job.nextRunAt,
      },
    });
  }
}
