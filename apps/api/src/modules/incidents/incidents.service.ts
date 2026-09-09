import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import type {
  AssetGraphNodeType,
  CreateIncidentRequestDto,
  IncidentDto,
  IncidentSeverity,
  IncidentSeverityFactorsDto,
  IncidentStatus,
  IncidentTimelineEventDto,
  IncidentTimelineEventType,
} from '@pentesthub/shared';
import type { AuditEventType, Prisma } from '../../prisma-types.js';
import { AppException } from '../../common/exceptions/app.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SlaService } from '../sla/sla.service.js';
import { AiMemoryService } from '../ai/memory/ai-memory.service.js';
import { IncidentCreatedEvent } from './events/incident-created.event.js';

interface IncidentRow {
  id: string;
  workspaceId: string;
  projectId: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  severityFactors: unknown;
  reporterId: string;
  assigneeId: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  resolvedAt: Date | string | null;
  closedAt: Date | string | null;
}

interface TimelineRow {
  id: string;
  incidentId: string;
  eventType: string;
  actorUserId: string | null;
  description: string;
  metadata: unknown;
  createdAt: Date | string;
}

/// Terminal statuses — reaching one of these auto-stamps `resolvedAt`
/// (RESOLVED) or `closedAt` (CLOSED); leaving one (e.g. REOPENED) clears
/// the corresponding stamp so the field always reflects current state,
/// never a stale historical one. See `applyStatusStamps`.
const RESOLVED_LIKE: readonly IncidentStatus[] = ['RESOLVED'];
const CLOSED_LIKE: readonly IncidentStatus[] = ['CLOSED'];

function toDto(row: IncidentRow): IncidentDto {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    title: row.title,
    description: row.description,
    severity: row.severity as IncidentSeverity,
    status: row.status as IncidentStatus,
    severityFactors: (row.severityFactors as IncidentSeverityFactorsDto | null) ?? null,
    reporterId: row.reporterId,
    assigneeId: row.assigneeId,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    resolvedAt: row.resolvedAt ? new Date(row.resolvedAt).toISOString() : null,
    closedAt: row.closedAt ? new Date(row.closedAt).toISOString() : null,
  };
}

function toTimelineDto(row: TimelineRow): IncidentTimelineEventDto {
  return {
    id: row.id,
    incidentId: row.incidentId,
    eventType: row.eventType as IncidentTimelineEventType,
    actorUserId: row.actorUserId,
    description: row.description,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

/// Module 17 — task #470 (Incident Management). Follows the same
/// direct-Prisma-cast pattern `ResearchSessionService` established for
/// Module 16 brand-new models the sandbox's stale `@prisma/client`
/// doesn't have typed accessors for yet (see that file's doc comment).
///
/// Incident timeline events are append-only by design (spec section 12 —
/// "Incident Timeline (immutable)"): every mutating method below writes
/// exactly one timeline row alongside its state change and never
/// updates/deletes an existing timeline row. Free-text discussion should
/// go through the existing Collaboration Comment infrastructure against
/// `entityType: 'INCIDENT'` (already supported — `CollaborationEntityType`
/// was extended with `INCIDENT` for exactly this reuse) rather than a
/// second comment mechanism here; the `COMMENT` timeline event type exists
/// for future EventBus-driven mirroring of those comments onto the
/// timeline, not as primary storage.
@Injectable()
export class IncidentsService {
  private readonly logger = new Logger(IncidentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sla: SlaService,
    private readonly eventBus: EventBus,
    private readonly aiMemory: AiMemoryService,
  ) {}

  /// Module 17 — task #485 (AI Memory extension). Mirrors this incident's
  /// current title/description/severity/status into the existing
  /// `AiMemoryChunk` RAG store under sourceType INCIDENT, sourceId =
  /// incidentId — replaces (not appends) the chunk set on every call,
  /// same as `ResearcherMemoryEntry`'s indexContent-on-update pattern, so
  /// re-indexing after a status/assignment change keeps the memory
  /// current rather than accumulating stale copies. Best-effort: never
  /// blocks or fails the caller's own state change — `AiMemoryService`
  /// already no-ops quietly when no embedding provider is configured
  /// (Community Edition without BYOK).
  private async syncIncidentMemory(row: IncidentRow): Promise<void> {
    try {
      await this.aiMemory.indexContent({
        workspaceId: row.workspaceId,
        projectId: row.projectId,
        sourceType: 'INCIDENT',
        sourceId: row.id,
        content: `${row.title}\n\n${row.description}\n\nSeverity: ${row.severity}\nStatus: ${row.status}`,
        metadata: { severity: row.severity, status: row.status, assigneeId: row.assigneeId },
      });
    } catch (error: unknown) {
      this.logger.warn(`Failed to index AI memory for incident ${row.id}: ${String(error)}`);
    }
  }

  private get incidentTable() {
    return (
      this.prisma as unknown as {
        incident: {
          create: (args: unknown) => Promise<IncidentRow>;
          findMany: (args: unknown) => Promise<IncidentRow[]>;
          findUnique: (args: unknown) => Promise<IncidentRow | null>;
          update: (args: unknown) => Promise<IncidentRow>;
        };
      }
    ).incident;
  }

  private get timelineTable() {
    return (
      this.prisma as unknown as {
        incidentTimelineEvent: {
          create: (args: unknown) => Promise<TimelineRow>;
          findMany: (args: unknown) => Promise<TimelineRow[]>;
        };
      }
    ).incidentTimelineEvent;
  }

  private get linkTables() {
    return this.prisma as unknown as {
      incidentAssetLink: { create: (args: unknown) => Promise<unknown>; findMany: (args: unknown) => Promise<unknown[]> };
      incidentFindingLink: { create: (args: unknown) => Promise<unknown>; findMany: (args: unknown) => Promise<unknown[]> };
      incidentIndicatorLink: { create: (args: unknown) => Promise<unknown>; findMany: (args: unknown) => Promise<unknown[]> };
      incidentEvidenceLink: { create: (args: unknown) => Promise<unknown>; findMany: (args: unknown) => Promise<unknown[]> };
      incidentResearchSessionLink: { create: (args: unknown) => Promise<unknown>; findMany: (args: unknown) => Promise<unknown[]> };
    };
  }

  /// Best-effort audit write mirroring the extension-registry precedent
  /// (`recordExtensionAudit`) — direct `prisma.auditEvent.create` rather
  /// than `AuditService`, since this service has no HTTP request context
  /// (ipAddress/userAgent) to pass through; controllers stay unaware of
  /// audit-logging mechanics.
  private async audit(
    userId: string,
    type: AuditEventType,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.auditEvent.create({
      data: { userId, type, ipAddress: '0.0.0.0', userAgent: 'api', metadata: metadata as Prisma.InputJsonValue },
    });
  }

  private async appendTimeline(
    incidentId: string,
    eventType: IncidentTimelineEventType,
    actorUserId: string | null,
    description: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.timelineTable.create({
      data: {
        incidentId,
        eventType,
        actorUserId,
        description,
        metadata: metadata ?? null,
      },
    });
  }

  private applyStatusStamps(status: IncidentStatus): { resolvedAt: Date | null; closedAt: Date | null } {
    return {
      resolvedAt: RESOLVED_LIKE.includes(status) ? new Date() : null,
      closedAt: CLOSED_LIKE.includes(status) ? new Date() : null,
    };
  }

  async create(
    workspaceId: string,
    userId: string,
    dto: CreateIncidentRequestDto,
  ): Promise<IncidentDto> {
    // Security review (task #492): `dto.projectId` is client-supplied and
    // was previously written straight into the row with no ownership
    // check — a caller who knew/guessed a foreign workspace's projectId
    // could create an Incident pointing at it, and downstream readers
    // that key off `incident.projectId` (e.g. AiSocAnalystService's
    // CorrelationInsight lookup) would then leak that other workspace's
    // data. Same `project.findFirst({ id, workspaceId, deletedAt: null })`
    // idiom already established in RemediationService.linkEvidence.
    const project = await this.prisma.project.findFirst({
      where: { id: dto.projectId, workspaceId, deletedAt: null },
      select: { id: true },
    });
    if (!project) {
      throw new AppException('PROJECT_NOT_FOUND', 'Project not found.', HttpStatus.NOT_FOUND);
    }

    const row = await this.incidentTable.create({
      data: {
        workspaceId,
        projectId: dto.projectId,
        title: dto.title,
        description: dto.description,
        severity: dto.severity,
        status: 'OPEN',
        severityFactors: dto.severityFactors ?? null,
        reporterId: userId,
      },
    });

    await this.appendTimeline(row.id, 'CREATED', userId, `Incident created with severity ${dto.severity}.`, {
      severity: dto.severity,
      severityFactors: dto.severityFactors ?? null,
    });
    await this.audit(userId, 'INCIDENT_CREATED', { incidentId: row.id, workspaceId, severity: dto.severity });

    // Module 17 — task #478 (SLA Engine). `IncidentSeverity` and
    // `VulnFindingSeverity` share the same LOW/MEDIUM/HIGH/CRITICAL values
    // (see `SlaPolicy`'s own doc comment) — a direct pass-through, not a
    // lookup table. Best-effort: a missing/misconfigured SLA policy (or
    // any other failure here) must never block incident creation, which
    // has already committed by this point — matches the platform's
    // established "derived intelligence is additive, not load-bearing"
    // posture for exactly this kind of side effect.
    try {
      await this.sla.startClock(workspaceId, dto.severity, { incidentId: row.id });
    } catch (error: unknown) {
      this.logger.warn(`Failed to start SLA clock for incident ${row.id}: ${String(error)}`);
    }

    // Module 17 — task #482 (Notification engine extensions). Published
    // after the incident row + timeline + audit entry are already
    // durably committed — a failure to publish (or a downstream
    // notification handler failure) must never roll back or block
    // incident creation itself. See IncidentCreatedEvent's doc comment.
    try {
      this.eventBus.publish(new IncidentCreatedEvent(workspaceId, row.id, dto.severity, dto.title, userId));
    } catch (error: unknown) {
      this.logger.warn(`Failed to publish IncidentCreatedEvent for incident ${row.id}: ${String(error)}`);
    }

    // Module 17 — task #485 (AI Memory extension). Best-effort, after the
    // incident row is already durably committed — see
    // `syncIncidentMemory`'s own doc comment.
    await this.syncIncidentMemory(row);

    return toDto(row);
  }

  async listForWorkspace(
    workspaceId: string,
    filters: { status?: IncidentStatus; severity?: IncidentSeverity; projectId?: string; limit?: number },
  ): Promise<IncidentDto[]> {
    const rows = await this.incidentTable.findMany({
      where: {
        workspaceId,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.severity ? { severity: filters.severity } : {}),
        ...(filters.projectId ? { projectId: filters.projectId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: filters.limit ?? 100,
    });
    return rows.map(toDto);
  }

  async getForWorkspace(id: string, workspaceId: string): Promise<IncidentDto> {
    const row = await this.incidentTable.findUnique({ where: { id } });
    if (!row || row.workspaceId !== workspaceId) {
      throw new AppException('INCIDENT_NOT_FOUND', 'Incident not found.', HttpStatus.NOT_FOUND);
    }
    return toDto(row);
  }

  private async requireOwnedRow(id: string, workspaceId: string): Promise<IncidentRow> {
    const row = await this.incidentTable.findUnique({ where: { id } });
    if (!row || row.workspaceId !== workspaceId) {
      throw new AppException('INCIDENT_NOT_FOUND', 'Incident not found.', HttpStatus.NOT_FOUND);
    }
    return row;
  }

  async updateStatus(
    id: string,
    workspaceId: string,
    userId: string,
    status: IncidentStatus,
    reason?: string,
  ): Promise<IncidentDto> {
    const existing = await this.requireOwnedRow(id, workspaceId);
    const stamps = this.applyStatusStamps(status);

    const row = await this.incidentTable.update({
      where: { id },
      data: { status, ...stamps },
    });

    await this.appendTimeline(
      id,
      'STATUS_CHANGED',
      userId,
      reason ?? `Status changed from ${existing.status} to ${status}.`,
      { from: existing.status, to: status },
    );
    await this.audit(userId, 'INCIDENT_STATUS_CHANGED', { incidentId: id, workspaceId, from: existing.status, to: status });

    if (status === 'CONTAINMENT') {
      await this.appendTimeline(id, 'CONTAINMENT', userId, 'Incident entered containment.');
    }
    if (status === 'RESOLVED') {
      await this.appendTimeline(id, 'RESOLUTION', userId, 'Incident resolved.');
    }

    // Module 17 — task #478. Resolving the SLA clock on either terminal
    // state (RESOLVED or CLOSED) is safe to attempt on both: `resolveClock`
    // only acts on a still-unresolved STARTED event, so a second call
    // (e.g. RESOLVED then later CLOSED) is a harmless no-op the second
    // time. Best-effort — same rationale as `create`'s startClock call.
    if (RESOLVED_LIKE.includes(status) || CLOSED_LIKE.includes(status)) {
      try {
        await this.sla.resolveClock(workspaceId, { incidentId: id });
      } catch (error: unknown) {
        this.logger.warn(`Failed to resolve SLA clock for incident ${id}: ${String(error)}`);
      }
    }

    // Module 17 — task #485. Re-index so a status change (e.g. RESOLVED)
    // is reflected in what semantic search recalls about this incident.
    await this.syncIncidentMemory(row);

    return toDto(row);
  }

  async assign(
    id: string,
    workspaceId: string,
    userId: string,
    assigneeId: string | null | undefined,
  ): Promise<IncidentDto> {
    const existing = await this.requireOwnedRow(id, workspaceId);
    const nextAssignee = assigneeId ?? null;

    const row = await this.incidentTable.update({
      where: { id },
      data: { assigneeId: nextAssignee },
    });

    await this.appendTimeline(
      id,
      'ASSIGNMENT_CHANGED',
      userId,
      nextAssignee ? `Assigned to ${nextAssignee}.` : 'Unassigned.',
      { from: existing.assigneeId, to: nextAssignee },
    );
    await this.audit(userId, 'INCIDENT_ASSIGNED', { incidentId: id, workspaceId, assigneeId: nextAssignee });

    return toDto(row);
  }

  async addNote(id: string, workspaceId: string, userId: string, description: string): Promise<IncidentTimelineEventDto> {
    const incident = await this.requireOwnedRow(id, workspaceId);
    const row = await this.timelineTable.create({
      data: { incidentId: id, eventType: 'COMMENT', actorUserId: userId, description, metadata: null },
    });

    // Module 17 — task #485 (AI Memory extension — "analyst context").
    // Indexed as its own source (sourceId `${incidentId}:note:${row.id}`,
    // distinct from `syncIncidentMemory`'s `${incidentId}` source) so an
    // analyst's free-text observation is individually recallable by
    // semantic search rather than only living inside the incident's own
    // summary chunk, which only ever reflects current state (title/
    // description/severity/status), not the running discussion.
    // Best-effort, matching every other AI-memory call site in this file.
    try {
      await this.aiMemory.indexContent({
        workspaceId,
        projectId: incident.projectId,
        sourceType: 'INCIDENT',
        sourceId: `${id}:note:${row.id}`,
        content: description,
        metadata: { incidentId: id, actorUserId: userId, kind: 'analyst_note' },
      });
    } catch (error: unknown) {
      this.logger.warn(`Failed to index AI memory for incident note ${row.id}: ${String(error)}`);
    }

    return toTimelineDto(row);
  }

  async listTimeline(id: string, workspaceId: string): Promise<IncidentTimelineEventDto[]> {
    await this.requireOwnedRow(id, workspaceId);
    const rows = await this.timelineTable.findMany({
      where: { incidentId: id },
      orderBy: { createdAt: 'asc' },
      take: 1000,
    });
    return rows.map(toTimelineDto);
  }

  async linkAsset(
    id: string,
    workspaceId: string,
    userId: string,
    targetId: string,
    nodeType: AssetGraphNodeType,
    refId: string,
  ): Promise<void> {
    await this.requireOwnedRow(id, workspaceId);
    await this.linkTables.incidentAssetLink.create({
      data: { incidentId: id, targetId, nodeType, refId, linkedBy: userId },
    });
    await this.appendTimeline(id, 'ASSET_LINKED', userId, `Linked asset ${nodeType}:${refId}.`, { targetId, nodeType, refId });
  }

  async linkFinding(id: string, workspaceId: string, userId: string, findingId: string): Promise<void> {
    await this.requireOwnedRow(id, workspaceId);
    await this.linkTables.incidentFindingLink.create({
      data: { incidentId: id, findingId, linkedBy: userId },
    });
    await this.appendTimeline(id, 'FINDING_LINKED', userId, `Linked finding ${findingId}.`, { findingId });
  }

  async linkIndicator(id: string, workspaceId: string, userId: string, indicatorId: string): Promise<void> {
    await this.requireOwnedRow(id, workspaceId);
    await this.linkTables.incidentIndicatorLink.create({
      data: { incidentId: id, indicatorId, linkedBy: userId },
    });
    await this.appendTimeline(id, 'INDICATOR_LINKED', userId, `Linked indicator ${indicatorId}.`, { indicatorId });
  }

  async linkEvidence(id: string, workspaceId: string, userId: string, evidenceId: string): Promise<void> {
    await this.requireOwnedRow(id, workspaceId);
    await this.linkTables.incidentEvidenceLink.create({
      data: { incidentId: id, evidenceId, linkedBy: userId },
    });
    await this.appendTimeline(id, 'EVIDENCE_ADDED', userId, `Linked evidence ${evidenceId}.`, { evidenceId });
  }

  async linkResearchSession(id: string, workspaceId: string, userId: string, sessionId: string): Promise<void> {
    await this.requireOwnedRow(id, workspaceId);
    await this.linkTables.incidentResearchSessionLink.create({
      data: { incidentId: id, researchSessionId: sessionId, linkedBy: userId },
    });
    await this.appendTimeline(id, 'AI_ANALYSIS', userId, `Linked research session ${sessionId}.`, { sessionId });
  }

  /// Module 17 — task #471 (AI SOC Analyst). Read-only helper so
  /// `AiSocAnalystService` can gather this incident's linked findings as
  /// evidence without duplicating the `incidentFindingLink` cast pattern
  /// or bypassing the workspace-ownership check every other method here
  /// enforces.
  async listLinkedFindingIds(id: string, workspaceId: string): Promise<string[]> {
    await this.requireOwnedRow(id, workspaceId);
    const rows = await this.linkTables.incidentFindingLink.findMany({ where: { incidentId: id } });
    return (rows as { findingId: string }[]).map((r) => r.findingId);
  }

  /// Module 17 — task #472 (AI Investigation Workflow). Read-only helper,
  /// same shape as `listLinkedFindingIds`, so `IncidentInvestigationService`
  /// can build a THREAT_INTEL_LOOKUP step's evidence without reaching into
  /// this service's private `linkTables` cast or bypassing the
  /// workspace-ownership check.
  async listLinkedIndicatorIds(id: string, workspaceId: string): Promise<string[]> {
    await this.requireOwnedRow(id, workspaceId);
    const rows = await this.linkTables.incidentIndicatorLink.findMany({ where: { incidentId: id } });
    return (rows as { indicatorId: string }[]).map((r) => r.indicatorId);
  }

  /// Module 17 — task #472 (AI Investigation Workflow). Read-only helper
  /// backing an EVIDENCE_REVIEW step's evidence-count summary.
  async listLinkedEvidenceIds(id: string, workspaceId: string): Promise<string[]> {
    await this.requireOwnedRow(id, workspaceId);
    const rows = await this.linkTables.incidentEvidenceLink.findMany({ where: { incidentId: id } });
    return (rows as { evidenceId: string }[]).map((r) => r.evidenceId);
  }

  /// Module 17 — task #473 (Defensive Security Playbooks). Read-only
  /// helper `IncidentPlaybooksService` uses to resolve a real `Target` to
  /// run an existing (Module 16, unmodified) playbook against — a
  /// playbook execution always needs a `Target`, and an Incident's own
  /// linked assets (`IncidentAssetLink.targetId`) are the only place that
  /// target can honestly come from. Deduplicated: the same Target may be
  /// linked via multiple asset-graph nodes.
  async listLinkedAssetTargetIds(id: string, workspaceId: string): Promise<string[]> {
    await this.requireOwnedRow(id, workspaceId);
    const rows = await this.linkTables.incidentAssetLink.findMany({ where: { incidentId: id } });
    const targetIds = (rows as { targetId: string }[]).map((r) => r.targetId);
    return Array.from(new Set(targetIds));
  }

  /// Module 17 — task #473 (Defensive Security Playbooks). Writes the
  /// previously-unused `PLAYBOOK_EXECUTED` timeline event type when
  /// `IncidentPlaybooksService` starts a playbook run against this
  /// incident — makes the run visible on the incident's own timeline,
  /// same pattern as `appendApprovalEvent`.
  async appendPlaybookExecutionEvent(
    id: string,
    workspaceId: string,
    actorUserId: string,
    description: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.requireOwnedRow(id, workspaceId);
    await this.appendTimeline(id, 'PLAYBOOK_EXECUTED', actorUserId, description, metadata);
  }

  /// Module 17 — task #472 (AI Investigation Workflow). Writes the
  /// previously-unused `APPROVAL` timeline event type when an incident
  /// investigation plan is approved/denied — makes that decision visible
  /// on the incident's own timeline, not just inside the investigation
  /// session record. Append-only, `actorUserId` is always the human
  /// decider (never null, unlike `appendAiAnalysisEvent` — an approval
  /// decision is always a human action).
  async appendApprovalEvent(
    id: string,
    workspaceId: string,
    actorUserId: string,
    description: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.requireOwnedRow(id, workspaceId);
    await this.appendTimeline(id, 'APPROVAL', actorUserId, description, metadata);
  }

  /// Module 17 — task #471 (AI SOC Analyst). The ONLY way an AI-generated
  /// analysis touches an Incident: one append-only `AI_ANALYSIS` timeline
  /// row, visible to the team and never mutating `severity`/`status`/any
  /// other Incident field. `AiSocAnalystService` returns its full
  /// analysis (including a *suggested* severity) directly to the caller
  /// — applying that suggestion is a separate, human-initiated action
  /// through this service's existing (non-AI) update paths, never done
  /// automatically here. This is what "AI must not change severity
  /// without audit" (spec constraint) means in practice: the AI's
  /// opinion is recorded, not enacted.
  async appendAiAnalysisEvent(
    id: string,
    workspaceId: string,
    description: string,
    metadata: Record<string, unknown>,
  ): Promise<string> {
    await this.requireOwnedRow(id, workspaceId);
    const row = await this.timelineTable.create({
      data: { incidentId: id, eventType: 'AI_ANALYSIS', actorUserId: null, description, metadata },
    });
    return row.id;
  }
}
