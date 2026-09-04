import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { AppException } from '../../../common/exceptions/app.exception.js';
import type {
  SuggestAttackPathsRequestDto,
  SuggestAttackPathsResultDto,
  SummarizeEngagementRequestDto,
  SummarizeEngagementResultDto,
} from '@pentesthub/shared';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  BUGBOUNTY_FINDINGS_REPOSITORY,
  type BugBountyFindingsRepository,
} from '../domain/repositories/bugbounty-findings.repository.interface.js';
import {
  BUGBOUNTY_PROGRAMS_REPOSITORY,
  type BugBountyProgramsRepository,
} from '../domain/repositories/bugbounty-programs.repository.interface.js';
import {
  TARGETS_REPOSITORY,
  type TargetsRepository,
} from '../../targets/domain/repositories/targets.repository.interface.js';
import {
  PROJECTS_REPOSITORY,
  type ProjectsRepository,
} from '../../projects/domain/repositories/projects.repository.interface.js';
import { resolveWorkspaceForCaller } from '../authorization.util.js';
import { resolveTargetForCaller } from '../../targets/commands/target-lifecycle.commands.js';
import { BugBountyAiAssistantService } from '../ai/bugbounty-ai-assistant.service.js';

// ---------------------------------------------------------------------------
// Suggest Attack Paths — workspace-level (optionally scoped to a target
// and/or an existing finding for extra context).
// ---------------------------------------------------------------------------

export class SuggestAttackPathsCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly data: SuggestAttackPathsRequestDto,
  ) {}
}

@CommandHandler(SuggestAttackPathsCommand)
export class SuggestAttackPathsHandler
  implements ICommandHandler<SuggestAttackPathsCommand, SuggestAttackPathsResultDto>
{
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(BUGBOUNTY_FINDINGS_REPOSITORY)
    private readonly findingsRepository: BugBountyFindingsRepository,
    @Inject(TARGETS_REPOSITORY)
    private readonly targetsRepository: TargetsRepository,
    @Inject(PROJECTS_REPOSITORY)
    private readonly projectsRepository: ProjectsRepository,
    private readonly assistant: BugBountyAiAssistantService,
  ) {}

  async execute(
    command: SuggestAttackPathsCommand,
  ): Promise<SuggestAttackPathsResultDto> {
    const workspace = await resolveWorkspaceForCaller(
      this.workspacesRepository,
      command.userId,
    );

    const finding = command.data.findingId
      ? await this.findingsRepository.findByIdForWorkspace(
          command.data.findingId,
          workspace.id,
        )
      : null;
    // Module 18 — task #508 (IDOR sweep). Was a bare `findById(targetId)`
    // with no ownership check — a caller could supply another workspace's
    // targetId and have its value fed straight into the AI attack-path
    // suggestion flow. Reuse the same enumeration-safe resolver every other
    // Target-scoped command uses; not-found/not-owned is swallowed to a
    // `null` target (same as this handler's pre-existing findingId/
    // programId lookups elsewhere in this file) rather than surfaced as an
    // error, since targetId here is optional supplementary context, not a
    // required resource reference.
    let target: { value: string } | null = null;
    if (command.data.targetId) {
      try {
        target = (
          await resolveTargetForCaller(
            this.workspacesRepository,
            this.projectsRepository,
            this.targetsRepository,
            command.userId,
            command.data.targetId,
          )
        ).target;
      } catch (err) {
        if (!(err instanceof AppException) || err.code !== 'TARGET_NOT_FOUND') {
          throw err;
        }
      }
    }

    const result = await this.assistant.suggestAttackPaths({
      workspaceId: workspace.id,
      finding,
      targetValue: target?.value ?? null,
      provider: command.data.provider,
      model: command.data.model,
    });
    return { suggestions: result.suggestions };
  }
}

// ---------------------------------------------------------------------------
// Summarize Engagement — Program- or Project-level rollup.
// ---------------------------------------------------------------------------

export class SummarizeEngagementCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly data: SummarizeEngagementRequestDto,
  ) {}
}

@CommandHandler(SummarizeEngagementCommand)
export class SummarizeEngagementHandler
  implements ICommandHandler<SummarizeEngagementCommand, SummarizeEngagementResultDto>
{
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(BUGBOUNTY_FINDINGS_REPOSITORY)
    private readonly findingsRepository: BugBountyFindingsRepository,
    @Inject(BUGBOUNTY_PROGRAMS_REPOSITORY)
    private readonly programsRepository: BugBountyProgramsRepository,
    private readonly assistant: BugBountyAiAssistantService,
  ) {}

  async execute(
    command: SummarizeEngagementCommand,
  ): Promise<SummarizeEngagementResultDto> {
    const workspace = await resolveWorkspaceForCaller(
      this.workspacesRepository,
      command.userId,
    );

    const program = command.data.programId
      ? await this.programsRepository.findByIdForWorkspace(
          command.data.programId,
          workspace.id,
        )
      : null;

    const findings = await this.findingsRepository.list({
      workspaceId: workspace.id,
      ...(command.data.programId ? { programId: command.data.programId } : {}),
      ...(command.data.projectId ? { projectId: command.data.projectId } : {}),
      limit: 200,
    });

    const result = await this.assistant.summarizeEngagement({
      workspaceId: workspace.id,
      program,
      findings,
      provider: command.data.provider,
      model: command.data.model,
    });

    const severityRank: Record<string, number> = {
      CRITICAL: 4,
      HIGH: 3,
      MEDIUM: 2,
      LOW: 1,
      INFO: 0,
    };
    const keyFindings = [...findings]
      .sort((a, b) => (severityRank[b.severity] ?? 0) - (severityRank[a.severity] ?? 0))
      .slice(0, 5)
      .map((f) => ({ findingId: f.id, title: f.title, severity: f.severity }));

    return {
      summary: result.summary,
      keyFindings,
      coverageNotes: result.coverageNotes,
      recommendedNextSteps: result.recommendedNextSteps,
    };
  }
}
