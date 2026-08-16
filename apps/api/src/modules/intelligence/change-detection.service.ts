import { Injectable, Logger } from '@nestjs/common';
import type { ChangeDetectionEventDto } from '@pentesthub/shared';
import { PrismaService } from '../../prisma/prisma.service.js';

interface ChangeDetectionEventRow {
  id: string;
  targetId: string;
  reconJobId: string | null;
  changeType: string;
  entityRef: string;
  previousValue: unknown;
  newValue: unknown;
  detectedAt: Date | string;
}

function toDto(row: ChangeDetectionEventRow): ChangeDetectionEventDto {
  return {
    id: row.id,
    targetId: row.targetId,
    reconJobId: row.reconJobId,
    changeType: row.changeType as ChangeDetectionEventDto['changeType'],
    entityRef: row.entityRef,
    previousValue: row.previousValue,
    newValue: row.newValue,
    detectedAt: new Date(row.detectedAt).toISOString(),
  };
}

/// Module 16 — task #376. Written whenever a Recon job completes and a
/// prior *completed* job exists for the same target — compares the two
/// `ReconFinding` sets (SUBDOMAIN/OPEN_PORT/TECHNOLOGY) rather than
/// storing full snapshots (see schema.prisma's doc comment on the model).
@Injectable()
export class ChangeDetectionService {
  private readonly logger = new Logger(ChangeDetectionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async diffLatestForTarget(
    workspaceId: string,
    projectId: string,
    targetId: string,
    currentJobId: string,
  ): Promise<number> {
    // Find the previous completed job for this target (excluding the one
    // that just completed).
    const previousJob = await this.prisma.reconJob.findFirst({
      where: { targetId, status: 'COMPLETED', id: { not: currentJobId } },
      orderBy: { completedAt: 'desc' },
    });
    if (!previousJob) {
      // First-ever completed job for this target — nothing to diff
      // against yet. Not an error; just no change events this run.
      return 0;
    }

    const [previousSubdomains, currentSubdomains, previousPorts, currentPorts] =
      await Promise.all([
        this.valuesForJob(previousJob.id, 'SUBDOMAIN'),
        this.valuesForJob(currentJobId, 'SUBDOMAIN'),
        this.valuesForJob(previousJob.id, 'OPEN_PORT'),
        this.valuesForJob(currentJobId, 'OPEN_PORT'),
      ]);

    const events: Array<{ changeType: string; entityRef: string; previousValue: unknown; newValue: unknown }> = [];

    for (const added of currentSubdomains.filter((v) => !previousSubdomains.includes(v))) {
      events.push({ changeType: 'NEW_SUBDOMAIN', entityRef: added, previousValue: null, newValue: added });
    }
    for (const removed of previousSubdomains.filter((v) => !currentSubdomains.includes(v))) {
      events.push({ changeType: 'REMOVED_SUBDOMAIN', entityRef: removed, previousValue: removed, newValue: null });
    }
    for (const added of currentPorts.filter((v) => !previousPorts.includes(v))) {
      events.push({ changeType: 'NEW_PORT', entityRef: added, previousValue: null, newValue: added });
    }
    for (const removed of previousPorts.filter((v) => !currentPorts.includes(v))) {
      events.push({ changeType: 'CLOSED_PORT', entityRef: removed, previousValue: removed, newValue: null });
    }

    if (events.length === 0) return 0;

    const createMany = (
      this.prisma as unknown as {
        changeDetectionEvent: { createMany: (args: unknown) => Promise<{ count: number }> };
      }
    ).changeDetectionEvent;

    const result = await createMany.createMany({
      data: events.map((e) => ({
        workspaceId,
        projectId,
        targetId,
        reconJobId: currentJobId,
        ...e,
      })),
    });

    this.logger.log(`Recorded ${result.count} change-detection events for target ${targetId}`);
    return result.count;
  }

  async listForTarget(targetId: string, limit = 100): Promise<ChangeDetectionEventDto[]> {
    const rows = await (
      this.prisma as unknown as {
        changeDetectionEvent: { findMany: (args: unknown) => Promise<ChangeDetectionEventRow[]> };
      }
    ).changeDetectionEvent.findMany({
      where: { targetId },
      orderBy: { detectedAt: 'desc' },
      take: limit,
    });
    return rows.map(toDto);
  }

  private async valuesForJob(jobId: string, type: 'SUBDOMAIN' | 'OPEN_PORT'): Promise<string[]> {
    const findings = await this.prisma.reconFinding.findMany({
      where: { jobId, type },
      select: { value: true },
    });
    return findings.map((f) => f.value);
  }
}
