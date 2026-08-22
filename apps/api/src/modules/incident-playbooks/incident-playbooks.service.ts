import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { PlaybookExecutionDto } from '@pentesthub/shared';
import { AppException } from '../../common/exceptions/app.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { IncidentsService } from '../incidents/incidents.service.js';
import { PlaybookExecutionService } from '../playbooks/playbook-execution.service.js';
import {
  PLAYBOOK_EXECUTIONS_REPOSITORY,
  type PlaybookExecutionsRepository,
} from '../playbooks/domain/repositories/playbook-executions.repository.interface.js';
import { toPlaybookExecutionDto } from '../playbooks/mappers/to-playbook-dto.mapper.js';

interface IncidentPlaybookLinkRow {
  id: string;
  incidentId: string;
  executionId: string;
  playbookId: string;
  linkedBy: string | null;
  linkedAt: Date | string;
}

/// Module 17 — task #473 (Defensive Security Playbooks). Extends Module
/// 16's Playbook engine (task #389) by composing over it, not modifying
/// it: `PlaybookExecutionService.start()` — the exact same execution
/// engine every offensive playbook run already uses — is called here
/// completely unmodified. The only new logic is (1) resolving a real
/// `Target` from the incident's own linked assets, since a playbook
/// execution always needs one and an Incident is not itself a Target,
/// and (2) recording that this run happened in the context of an
/// incident (`IncidentPlaybookLink`) and mirroring it onto the incident's
/// timeline (`IncidentsService.appendPlaybookExecutionEvent`).
///
/// This is deliberately NOT a second execution engine: every step in the
/// playbook still runs through `PlaybookExecutionService`'s existing
/// ScopeEngine -> Permission Check -> Approval Gate -> ToolRunner path
/// exactly as it would for a manually-started run against a Target
/// directly. A defensive/incident-response playbook is simply one whose
/// graph (see `built-in-playbooks.data.ts`'s `INCIDENT_RESPONSE`-category
/// entries) is authored using only the engine's read-only/advisory step
/// types (EVIDENCE_COLLECTION/NOTIFICATION/APPROVAL/AI_ANALYSIS/
/// SCOPE_VALIDATION/CONDITION/DELAY) rather than the offensive
/// tool-invoking ones (RECON/PORT_SCAN/VULNERABILITY_SCAN/etc.) — the
/// engine does not need to know or enforce that distinction, the same
/// way it doesn't enforce which category a playbook declares itself.
@Injectable()
export class IncidentPlaybooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly incidents: IncidentsService,
    private readonly playbookExecutions: PlaybookExecutionService,
    @Inject(PLAYBOOK_EXECUTIONS_REPOSITORY) private readonly executionsRepository: PlaybookExecutionsRepository,
  ) {}

  private get linkTable() {
    return (
      this.prisma as unknown as {
        incidentPlaybookLink: {
          create: (args: unknown) => Promise<IncidentPlaybookLinkRow>;
          findMany: (args: unknown) => Promise<IncidentPlaybookLinkRow[]>;
        };
      }
    ).incidentPlaybookLink;
  }

  /// Resolves the incident's first linked asset's Target and starts the
  /// given (already-published) playbook against it via the unmodified
  /// `PlaybookExecutionService.start()`. `userId` MUST come from the
  /// authenticated request context — `start()` independently re-derives
  /// and validates workspace/playbook ownership from it, exactly as it
  /// does for a direct Target-based run; this method does not bypass any
  /// of that.
  async runAgainstIncident(
    userId: string,
    workspaceId: string,
    incidentId: string,
    playbookId: string,
    variableValues?: Record<string, unknown>,
  ): Promise<PlaybookExecutionDto> {
    // Ownership check — throws INCIDENT_NOT_FOUND if the incident doesn't
    // exist or isn't in this workspace.
    await this.incidents.getForWorkspace(incidentId, workspaceId);

    const targetIds = await this.incidents.listLinkedAssetTargetIds(incidentId, workspaceId);
    if (targetIds.length === 0) {
      throw new AppException(
        'INCIDENT_PLAYBOOK_NO_LINKED_ASSET',
        'Link at least one asset to this incident before running a playbook against it.',
        HttpStatus.CONFLICT,
      );
    }

    const execution = await this.playbookExecutions.start(userId, playbookId, {
      targetId: targetIds[0],
      variableValues: variableValues ?? {},
      isDryRun: false,
    });

    await this.linkTable.create({
      data: { incidentId, executionId: execution.id, playbookId, linkedBy: userId },
    });

    await this.incidents
      .appendPlaybookExecutionEvent(
        incidentId,
        workspaceId,
        userId,
        `Playbook run started (execution ${execution.id}, status ${execution.status}).`,
        { playbookId, executionId: execution.id, status: execution.status },
      )
      .catch(() => undefined);

    return execution;
  }

  /// Lists every playbook execution that has been run against this
  /// incident, most recent first. Reads through the same
  /// `PLAYBOOK_EXECUTIONS_REPOSITORY`/`toPlaybookExecutionDto` the
  /// Playbooks module's own controllers use — never a second execution
  /// read path.
  async listForIncident(incidentId: string, workspaceId: string): Promise<PlaybookExecutionDto[]> {
    await this.incidents.getForWorkspace(incidentId, workspaceId);
    // Task #494 (M17 performance pass): this query had no `take` — an
    // incident with a long history of playbook runs would pull every
    // link row ever created, then walk them one at a time with a
    // sequential `await` per row (two round trips each: the execution
    // itself, then its steps). Capped at the same 50-item "recent
    // history" bound used elsewhere in this module cluster, and the
    // per-link reads are now issued concurrently via `Promise.all`
    // instead of serially — same DB load, far less wall-clock time.
    const links = await this.linkTable.findMany({ where: { incidentId }, orderBy: { linkedAt: 'desc' }, take: 50 });

    const resolved = await Promise.all(
      links.map(async (link) => {
        const execution = await this.executionsRepository.findExecutionByIdForWorkspace(link.executionId, workspaceId);
        if (!execution) return null;
        const steps = await this.executionsRepository.listExecutionSteps(execution.id);
        return toPlaybookExecutionDto(execution, steps);
      }),
    );
    return resolved.filter((dto): dto is PlaybookExecutionDto => dto !== null);
  }
}
