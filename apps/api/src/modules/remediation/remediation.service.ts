import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import type {
  AssetGraphNodeType,
  CreateRemediationTaskRequestDto,
  RemediationEvidenceLinkDto,
  RemediationPriority,
  RemediationStatus,
  RemediationTaskDto,
  UpdateRemediationTaskRequestDto,
} from '@pentesthub/shared';
import type { AuditEventType, Prisma } from '../../prisma-types.js';
import { AppException } from '../../common/exceptions/app.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AiMemoryService } from '../ai/memory/ai-memory.service.js';
import { RemediationTaskClosedEvent } from './events/remediation-task-closed.event.js';

interface RemediationTaskRow {
  id: string;
  workspaceId: string;
  projectId: string;
  findingId: string | null;
  incidentId: string | null;
  assetNodeType: string | null;
  assetRefId: string | null;
  owner: string | null;
  team: string | null;
  priority: string;
  dueDate: Date | string | null;
  status: string;
  notes: string | null;
  createdBy: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  closedAt: Date | string | null;
}

interface RemediationEvidenceLinkRow {
  id: string;
  remediationTaskId: string;
  evidenceId: string;
  linkedBy: string | null;
  linkedAt: Date | string;
}

interface FindingVerificationRow {
  id: string;
  verificationStatus: string;
}

function toDto(row: RemediationTaskRow): RemediationTaskDto {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    findingId: row.findingId,
    incidentId: row.incidentId,
    assetNodeType: row.assetNodeType as AssetGraphNodeType | null,
    assetRefId: row.assetRefId,
    owner: row.owner,
    team: row.team,
    priority: row.priority as RemediationPriority,
    dueDate: row.dueDate ? new Date(row.dueDate).toISOString() : null,
    status: row.status as RemediationStatus,
    notes: row.notes,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    closedAt: row.closedAt ? new Date(row.closedAt).toISOString() : null,
  };
}

function toEvidenceLinkDto(row: RemediationEvidenceLinkRow): RemediationEvidenceLinkDto {
  return {
    id: row.id,
    remediationTaskId: row.remediationTaskId,
    evidenceId: row.evidenceId,
    linkedBy: row.linkedBy,
    linkedAt: new Date(row.linkedAt).toISOString(),
  };
}

/// Module 17 — task #477 (Remediation tracking, spec section 21). Follows
/// the same direct-Prisma-cast pattern used throughout Module 17 for
/// brand-new models (see `IncidentsService`'s doc comment).
///
/// The one piece of real business logic here — not just CRUD — is
/// `setStatus`'s CLOSED guard: spec section 22 requires that "verification
/// must require actual evidence" before a fix can be considered done. A
/// `RemediationTask` that targets a specific `findingId` cannot move to
/// CLOSED unless that finding's own `verificationStatus` is already
/// VERIFIED (enforced by `FindingVerificationService`, which is the only
/// path that can set VERIFIED, and only when a real Evidence row is
/// attached). Tasks with no `findingId` (e.g. an asset-hardening or
/// incident-only task with nothing to "verify a fix" against) are not
/// subject to this guard — there is no finding whose claim needs proving.
@Injectable()
export class RemediationService {
  private readonly logger = new Logger(RemediationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiMemory: AiMemoryService,
    private readonly eventBus: EventBus,
  ) {}

  /// Module 17 — task #485 (AI Memory extension). `RemediationTask` has
  /// no title column (see `toDto`'s own synthesis of a display title) —
  /// reused verbatim here rather than a second synthesis rule. Same
  /// replace-on-every-call semantics as `IncidentsService.syncIncidentMemory`.
  private async syncTaskMemory(row: RemediationTaskRow): Promise<void> {
    const title = `${row.priority} remediation — ${row.owner ?? row.team ?? 'unassigned'}`;
    try {
      await this.aiMemory.indexContent({
        workspaceId: row.workspaceId,
        projectId: row.projectId,
        sourceType: 'REMEDIATION_TASK',
        sourceId: row.id,
        content: `${title}\n\n${row.notes ?? ''}`.trim(),
        metadata: { priority: row.priority, status: row.status, findingId: row.findingId, incidentId: row.incidentId },
      });
    } catch (error: unknown) {
      this.logger.warn(`Failed to index AI memory for remediation task ${row.id}: ${String(error)}`);
    }
  }

  private get taskTable() {
    return (
      this.prisma as unknown as {
        remediationTask: {
          create: (args: unknown) => Promise<RemediationTaskRow>;
          findMany: (args: unknown) => Promise<RemediationTaskRow[]>;
          findUnique: (args: unknown) => Promise<RemediationTaskRow | null>;
          update: (args: unknown) => Promise<RemediationTaskRow>;
        };
      }
    ).remediationTask;
  }

  private get evidenceLinkTable() {
    return (
      this.prisma as unknown as {
        remediationEvidenceLink: {
          create: (args: unknown) => Promise<RemediationEvidenceLinkRow>;
          findMany: (args: unknown) => Promise<RemediationEvidenceLinkRow[]>;
        };
      }
    ).remediationEvidenceLink;
  }

  /// Best-effort audit write mirroring the extension-registry precedent —
  /// see `IncidentsService.audit`'s identical doc comment.
  private async audit(userId: string, type: AuditEventType, metadata: Record<string, unknown>): Promise<void> {
    await this.prisma.auditEvent.create({
      data: { userId, type, ipAddress: '0.0.0.0', userAgent: 'api', metadata: metadata as Prisma.InputJsonValue },
    });
  }

  async create(workspaceId: string, userId: string, dto: CreateRemediationTaskRequestDto): Promise<RemediationTaskDto> {
    // Security review (task #492): same cross-workspace projectId gap as
    // IncidentsService.create — validate ownership before writing the row.
    const project = await this.prisma.project.findFirst({
      where: { id: dto.projectId, workspaceId, deletedAt: null },
      select: { id: true },
    });
    if (!project) {
      throw new AppException('PROJECT_NOT_FOUND', 'Project not found.', HttpStatus.NOT_FOUND);
    }

    const row = await this.taskTable.create({
      data: {
        workspaceId,
        projectId: dto.projectId,
        findingId: dto.findingId ?? null,
        incidentId: dto.incidentId ?? null,
        assetNodeType: dto.assetNodeType ?? null,
        assetRefId: dto.assetRefId ?? null,
        owner: dto.owner ?? null,
        team: dto.team ?? null,
        priority: dto.priority ?? 'MEDIUM',
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        status: 'OPEN',
        notes: dto.notes ?? null,
        createdBy: userId,
      },
    });
    await this.audit(userId, 'REMEDIATION_TASK_CREATED', { remediationTaskId: row.id, workspaceId, findingId: dto.findingId ?? null });
    await this.syncTaskMemory(row);
    return toDto(row);
  }

  async listForWorkspace(
    workspaceId: string,
    filters: { status?: RemediationStatus; priority?: RemediationPriority; projectId?: string; incidentId?: string; findingId?: string; limit?: number },
  ): Promise<RemediationTaskDto[]> {
    const rows = await this.taskTable.findMany({
      where: {
        workspaceId,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.priority ? { priority: filters.priority } : {}),
        ...(filters.projectId ? { projectId: filters.projectId } : {}),
        ...(filters.incidentId ? { incidentId: filters.incidentId } : {}),
        ...(filters.findingId ? { findingId: filters.findingId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: filters.limit ?? 100,
    });
    return rows.map(toDto);
  }

  async getForWorkspace(id: string, workspaceId: string): Promise<RemediationTaskDto> {
    return toDto(await this.requireOwnedRow(id, workspaceId));
  }

  private async requireOwnedRow(id: string, workspaceId: string): Promise<RemediationTaskRow> {
    const row = await this.taskTable.findUnique({ where: { id } });
    if (!row || row.workspaceId !== workspaceId) {
      throw new AppException('REMEDIATION_TASK_NOT_FOUND', 'Remediation task not found.', HttpStatus.NOT_FOUND);
    }
    return row;
  }

  async update(id: string, workspaceId: string, dto: UpdateRemediationTaskRequestDto): Promise<RemediationTaskDto> {
    await this.requireOwnedRow(id, workspaceId);
    const row = await this.taskTable.update({
      where: { id },
      data: {
        ...(dto.owner !== undefined ? { owner: dto.owner } : {}),
        ...(dto.team !== undefined ? { team: dto.team } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.dueDate !== undefined ? { dueDate: dto.dueDate ? new Date(dto.dueDate) : null } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
    });
    await this.syncTaskMemory(row);
    return toDto(row);
  }

  async setStatus(id: string, workspaceId: string, userId: string, status: RemediationStatus): Promise<RemediationTaskDto> {
    const existing = await this.requireOwnedRow(id, workspaceId);

    if (status === 'CLOSED' && existing.findingId) {
      const finding = await (
        this.prisma as unknown as {
          bugBountyFinding: { findFirst: (args: unknown) => Promise<FindingVerificationRow | null> };
        }
      ).bugBountyFinding.findFirst({
        where: { id: existing.findingId, workspaceId, deletedAt: null },
        select: { id: true, verificationStatus: true },
      });
      if (!finding || finding.verificationStatus !== 'VERIFIED') {
        throw new AppException(
          'REMEDIATION_TASK_CLOSE_REQUIRES_FINDING_VERIFIED',
          'This task targets a finding whose fix has not been verified yet (spec section 22 — verification must require actual evidence). Verify the finding first via /findings/:id/verification.',
          HttpStatus.CONFLICT,
        );
      }
    }

    const row = await this.taskTable.update({
      where: { id },
      data: { status, closedAt: status === 'CLOSED' ? new Date() : existing.closedAt },
    });
    await this.audit(userId, 'REMEDIATION_TASK_STATUS_CHANGED', { remediationTaskId: id, workspaceId, from: existing.status, to: status });
    await this.syncTaskMemory(row);

    // Module 17 — task #486 (SOC Event Bus wiring). Only on an actual
    // CLOSED transition — see RemediationTaskClosedEvent's own doc
    // comment on why this signal means "verified and closed," not just
    // "status field changed." Best-effort, published after the row is
    // already durably committed.
    if (status === 'CLOSED') {
      try {
        this.eventBus.publish(
          new RemediationTaskClosedEvent(workspaceId, row.id, row.findingId, row.incidentId, row.priority),
        );
      } catch (error: unknown) {
        this.logger.warn(`Failed to publish RemediationTaskClosedEvent for task ${row.id}: ${String(error)}`);
      }
    }

    return toDto(row);
  }

  async linkEvidence(id: string, workspaceId: string, userId: string, evidenceId: string): Promise<RemediationEvidenceLinkDto> {
    await this.requireOwnedRow(id, workspaceId);
    // Evidence itself has no direct workspaceId column — scoped through
    // its Project relation, same lookup pattern KnowledgeGraphService uses.
    const evidence = await this.prisma.evidence.findFirst({
      where: { id: evidenceId, deletedAt: null, project: { workspaceId } },
    });
    if (!evidence) {
      throw new AppException('EVIDENCE_NOT_FOUND', 'Evidence not found.', HttpStatus.NOT_FOUND);
    }
    const row = await this.evidenceLinkTable.create({
      data: { remediationTaskId: id, evidenceId, linkedBy: userId },
    });
    await this.audit(userId, 'REMEDIATION_EVIDENCE_LINKED', { remediationTaskId: id, workspaceId, evidenceId });
    return toEvidenceLinkDto(row);
  }

  async listEvidence(id: string, workspaceId: string): Promise<RemediationEvidenceLinkDto[]> {
    await this.requireOwnedRow(id, workspaceId);
    const rows = await this.evidenceLinkTable.findMany({ where: { remediationTaskId: id }, orderBy: { linkedAt: 'desc' } });
    return rows.map(toEvidenceLinkDto);
  }
}
