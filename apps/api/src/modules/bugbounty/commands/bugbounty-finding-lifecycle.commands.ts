import {
  CommandHandler,
  EventBus,
  ICommand,
  ICommandHandler,
} from '@nestjs/cqrs';
import { HttpStatus, Inject } from '@nestjs/common';
import type {
  BugBountyFindingDto,
  CreateBugBountyFindingRequestDto,
  TransitionBugBountyFindingStageRequestDto,
  UpdateBugBountyFindingRequestDto,
} from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  BUGBOUNTY_PROGRAMS_REPOSITORY,
  type BugBountyProgramsRepository,
} from '../domain/repositories/bugbounty-programs.repository.interface.js';
import {
  BUGBOUNTY_FINDINGS_REPOSITORY,
  type BugBountyFindingsRepository,
} from '../domain/repositories/bugbounty-findings.repository.interface.js';
import {
  resolveBugBountyFindingForCaller,
  resolveBugBountyProgramForCaller,
} from '../authorization.util.js';
import { toBugBountyFindingDto } from '../mappers/to-bugbounty-finding-dto.mapper.js';
import {
  BugBountyFindingCreatedEvent,
  BugBountyFindingReportedEvent,
  BugBountyFindingStageChangedEvent,
} from '../events/bugbounty-finding-events.js';
import { AiMemoryService } from '../../ai/memory/ai-memory.service.js';
import {
  AI_MEMORY_REPOSITORY,
  type AiMemoryRepository,
} from '../../ai/domain/repositories/ai-memory.repository.interface.js';

/// Builds the text indexed into AiMemoryChunk for Duplicate Detection's
/// semantic-search half (see check-duplicate-finding.query.ts and ADR
/// 0006) — title + vulnType + endpoint + description, in that order so
/// the most identity-defining fields dominate the embedding.
function buildFindingIndexContent(finding: {
  title: string;
  vulnType: string | null;
  endpoint: string | null;
  description: string;
}): string {
  return [
    finding.title,
    finding.vulnType,
    finding.endpoint,
    finding.description,
  ]
    .filter((v): v is string => !!v?.trim())
    .join(' — ');
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export class CreateBugBountyFindingCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly data: CreateBugBountyFindingRequestDto,
  ) {}
}

@CommandHandler(CreateBugBountyFindingCommand)
export class CreateBugBountyFindingHandler implements ICommandHandler<
  CreateBugBountyFindingCommand,
  BugBountyFindingDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(BUGBOUNTY_PROGRAMS_REPOSITORY)
    private readonly programsRepository: BugBountyProgramsRepository,
    @Inject(BUGBOUNTY_FINDINGS_REPOSITORY)
    private readonly findingsRepository: BugBountyFindingsRepository,
    private readonly memoryService: AiMemoryService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(
    command: CreateBugBountyFindingCommand,
  ): Promise<BugBountyFindingDto> {
    const { workspaceId, program } = await resolveBugBountyProgramForCaller(
      this.workspacesRepository,
      this.programsRepository,
      command.userId,
      command.data.programId,
    );

    // BugBountyFinding.projectId is required, but BugBountyProgram.projectId
    // is optional (a program can be workspace-level, not yet tied to a
    // project) — a finding can only be created once the program has one.
    if (!program.projectId) {
      throw new AppException(
        'INVALID_REFERENCE',
        'Program must be linked to a project before findings can be created against it.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const finding = await this.findingsRepository.create({
      workspaceId,
      projectId: program.projectId,
      programId: program.id,
      targetId: command.data.targetId,
      vulnFindingId: command.data.vulnFindingId,
      title: command.data.title,
      description: command.data.description,
      severity: command.data.severity,
      cvssScore: command.data.cvssScore,
      cvssVector: command.data.cvssVector,
      cwe: command.data.cwe,
      vulnType: command.data.vulnType,
      endpoint: command.data.endpoint,
      payload: command.data.payload,
      tags: command.data.tags,
      evidenceIds: command.data.evidenceIds,
      createdBy: command.userId,
      capec: command.data.capec,
      owaspCategory: command.data.owaspCategory,
      mitreAttack: command.data.mitreAttack,
      cvssBreakdown: command.data.cvssBreakdown as
        | Record<string, unknown>
        | undefined,
    });

    this.eventBus.publish(
      new BugBountyFindingCreatedEvent(
        workspaceId,
        finding.projectId,
        command.userId,
        finding.id,
        { title: finding.title, severity: finding.severity },
      ),
    );

    // Best-effort (see AiMemoryService.indexContent) — Duplicate Detection's
    // semantic-search half degrades gracefully to lexical-only matching
    // when no embedding provider is configured.
    await this.memoryService.indexContent({
      workspaceId,
      projectId: finding.projectId,
      sourceType: 'BUGBOUNTY_FINDING',
      sourceId: finding.id,
      content: buildFindingIndexContent(finding),
    });

    const evidenceIds = await this.findingsRepository.listEvidenceIds(
      finding.id,
    );
    return toBugBountyFindingDto(finding, evidenceIds);
  }
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export class UpdateBugBountyFindingCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly findingId: string,
    public readonly data: UpdateBugBountyFindingRequestDto,
  ) {}
}

@CommandHandler(UpdateBugBountyFindingCommand)
export class UpdateBugBountyFindingHandler implements ICommandHandler<
  UpdateBugBountyFindingCommand,
  BugBountyFindingDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(BUGBOUNTY_FINDINGS_REPOSITORY)
    private readonly findingsRepository: BugBountyFindingsRepository,
    private readonly memoryService: AiMemoryService,
  ) {}

  async execute(
    command: UpdateBugBountyFindingCommand,
  ): Promise<BugBountyFindingDto> {
    await resolveBugBountyFindingForCaller(
      this.workspacesRepository,
      this.findingsRepository,
      command.userId,
      command.findingId,
    );

    const updated = await this.findingsRepository.update(command.findingId, {
      targetId: command.data.targetId,
      vulnFindingId: command.data.vulnFindingId,
      title: command.data.title,
      description: command.data.description,
      severity: command.data.severity,
      cvssScore: command.data.cvssScore,
      cvssVector: command.data.cvssVector,
      cwe: command.data.cwe,
      vulnType: command.data.vulnType,
      endpoint: command.data.endpoint,
      payload: command.data.payload,
      tags: command.data.tags,
      capec: command.data.capec,
      owaspCategory: command.data.owaspCategory,
      mitreAttack: command.data.mitreAttack,
      cvssBreakdown: command.data.cvssBreakdown as
        | Record<string, unknown>
        | undefined,
    });

    if (command.data.evidenceIds) {
      await this.findingsRepository.setEvidenceLinks(
        command.findingId,
        command.data.evidenceIds,
      );
    }

    if (
      command.data.title !== undefined ||
      command.data.description !== undefined ||
      command.data.vulnType !== undefined ||
      command.data.endpoint !== undefined
    ) {
      await this.memoryService.indexContent({
        workspaceId: updated.workspaceId,
        projectId: updated.projectId,
        sourceType: 'BUGBOUNTY_FINDING',
        sourceId: updated.id,
        content: buildFindingIndexContent(updated),
      });
    }

    const evidenceIds = await this.findingsRepository.listEvidenceIds(
      updated.id,
    );
    return toBugBountyFindingDto(updated, evidenceIds);
  }
}

// ---------------------------------------------------------------------------
// Transition stage
// ---------------------------------------------------------------------------

/// Terminal stages a finding cannot leave once reached — matches the
/// spec's "each state change must generate Activity Events" model of a
/// forward-moving lifecycle rather than a free-form status field. DUPLICATE
/// and NEED_MORE_INFO are side-branches (reachable from any active stage,
/// and NEED_MORE_INFO can return to an active stage), not terminal.
const TERMINAL_STAGES = new Set(['CLOSED', 'ARCHIVED']);

export class TransitionBugBountyFindingStageCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly findingId: string,
    public readonly data: TransitionBugBountyFindingStageRequestDto,
  ) {}
}

@CommandHandler(TransitionBugBountyFindingStageCommand)
export class TransitionBugBountyFindingStageHandler implements ICommandHandler<
  TransitionBugBountyFindingStageCommand,
  BugBountyFindingDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(BUGBOUNTY_FINDINGS_REPOSITORY)
    private readonly findingsRepository: BugBountyFindingsRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(
    command: TransitionBugBountyFindingStageCommand,
  ): Promise<BugBountyFindingDto> {
    const { workspaceId, finding } = await resolveBugBountyFindingForCaller(
      this.workspacesRepository,
      this.findingsRepository,
      command.userId,
      command.findingId,
    );

    if (TERMINAL_STAGES.has(finding.stage)) {
      throw new AppException(
        'BUGBOUNTY_FINDING_INVALID_STAGE_TRANSITION',
        `Finding is in terminal stage "${finding.stage}" and cannot transition further.`,
        HttpStatus.CONFLICT,
      );
    }
    if (command.data.stage === 'DUPLICATE' && !command.data.duplicateOfId) {
      throw new AppException(
        'BUGBOUNTY_FINDING_INVALID_STAGE_TRANSITION',
        'duplicateOfId is required when transitioning a finding to DUPLICATE.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const updated = await this.findingsRepository.transitionStage(
      command.findingId,
      {
        stage: command.data.stage,
        duplicateOfId:
          command.data.stage === 'DUPLICATE'
            ? command.data.duplicateOfId
            : null,
        bountyAmount: command.data.bountyAmount,
        currency: command.data.currency,
      },
    );

    this.eventBus.publish(
      new BugBountyFindingStageChangedEvent(
        workspaceId,
        updated.projectId,
        command.userId,
        updated.id,
        { fromStage: finding.stage, toStage: updated.stage },
      ),
    );

    if (updated.stage === 'REPORTED') {
      this.eventBus.publish(
        new BugBountyFindingReportedEvent(
          workspaceId,
          updated.projectId,
          command.userId,
          updated.id,
        ),
      );
    }

    const evidenceIds = await this.findingsRepository.listEvidenceIds(
      updated.id,
    );
    return toBugBountyFindingDto(updated, evidenceIds);
  }
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export class DeleteBugBountyFindingCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly findingId: string,
  ) {}
}

@CommandHandler(DeleteBugBountyFindingCommand)
export class DeleteBugBountyFindingHandler implements ICommandHandler<
  DeleteBugBountyFindingCommand,
  void
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(BUGBOUNTY_FINDINGS_REPOSITORY)
    private readonly findingsRepository: BugBountyFindingsRepository,
    @Inject(AI_MEMORY_REPOSITORY)
    private readonly memoryRepository: AiMemoryRepository,
  ) {}

  async execute(command: DeleteBugBountyFindingCommand): Promise<void> {
    await resolveBugBountyFindingForCaller(
      this.workspacesRepository,
      this.findingsRepository,
      command.userId,
      command.findingId,
    );
    await this.findingsRepository.softDelete(command.findingId);
    // Removes the finding's Duplicate Detection embedding chunks — without
    // this, a deleted finding could keep surfacing as a semantic-search
    // duplicate match indefinitely (see check-duplicate-finding.query.ts).
    await this.memoryRepository.deleteBySource(
      'BUGBOUNTY_FINDING',
      command.findingId,
    );
  }
}
