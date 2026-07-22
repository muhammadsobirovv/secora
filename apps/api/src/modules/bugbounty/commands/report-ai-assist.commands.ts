import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus, Inject } from '@nestjs/common';
import { AppException } from '../../../common/exceptions/app.exception.js';
import type {
  CorrectGrammarRequestDto,
  CorrectGrammarResultDto,
  ReviewReportQualityRequestDto,
  ReviewReportQualityResultDto,
} from '@pentesthub/shared';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  BUG_REPORTS_REPOSITORY,
  type BugReportsRepository,
} from '../domain/repositories/bug-reports.repository.interface.js';
import {
  BUGBOUNTY_PROGRAMS_REPOSITORY,
  type BugBountyProgramsRepository,
} from '../domain/repositories/bugbounty-programs.repository.interface.js';
import {
  BUGBOUNTY_FINDINGS_REPOSITORY,
  type BugBountyFindingsRepository,
} from '../domain/repositories/bugbounty-findings.repository.interface.js';
import { resolveBugReportForCaller } from '../authorization.util.js';
import { ReportDraftAssistantService } from '../reports/report-draft-assistant.service.js';

// ---------------------------------------------------------------------------
// Correct Grammar
// ---------------------------------------------------------------------------

export class CorrectGrammarCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly reportId: string,
    public readonly data: CorrectGrammarRequestDto,
  ) {}
}

@CommandHandler(CorrectGrammarCommand)
export class CorrectGrammarHandler
  implements ICommandHandler<CorrectGrammarCommand, CorrectGrammarResultDto>
{
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(BUG_REPORTS_REPOSITORY)
    private readonly reportsRepository: BugReportsRepository,
    private readonly assistant: ReportDraftAssistantService,
  ) {}

  async execute(command: CorrectGrammarCommand): Promise<CorrectGrammarResultDto> {
    const { workspaceId, report } = await resolveBugReportForCaller(
      this.workspacesRepository,
      this.reportsRepository,
      command.userId,
      command.reportId,
    );

    const original = (report[command.data.field] as string | null) ?? '';
    const { corrected, changes } = await this.assistant.correctGrammar({
      workspaceId,
      fieldName: command.data.field,
      text: original,
      provider: command.data.provider,
      model: command.data.model,
    });

    // Grammar correction is a *suggestion*, not an auto-apply — the
    // caller reviews the diff and, if they accept it, sends a normal
    // UpdateBugReportCommand with the corrected text. This handler only
    // records that a grammar check ran (grammarCheckedAt), not the
    // correction itself, so a report is never silently rewritten.
    await this.reportsRepository.update(command.reportId, {
      expectedVersion: report.version,
      grammarCheckedAt: new Date(),
    });

    return { field: command.data.field, original, corrected, changes };
  }
}

// ---------------------------------------------------------------------------
// Review Report Quality (AI Technical Review)
// ---------------------------------------------------------------------------

export class ReviewReportQualityCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly reportId: string,
    public readonly data: ReviewReportQualityRequestDto,
  ) {}
}

@CommandHandler(ReviewReportQualityCommand)
export class ReviewReportQualityHandler
  implements ICommandHandler<ReviewReportQualityCommand, ReviewReportQualityResultDto>
{
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(BUG_REPORTS_REPOSITORY)
    private readonly reportsRepository: BugReportsRepository,
    @Inject(BUGBOUNTY_PROGRAMS_REPOSITORY)
    private readonly programsRepository: BugBountyProgramsRepository,
    @Inject(BUGBOUNTY_FINDINGS_REPOSITORY)
    private readonly findingsRepository: BugBountyFindingsRepository,
    private readonly assistant: ReportDraftAssistantService,
  ) {}

  async execute(
    command: ReviewReportQualityCommand,
  ): Promise<ReviewReportQualityResultDto> {
    const { report } = await resolveBugReportForCaller(
      this.workspacesRepository,
      this.reportsRepository,
      command.userId,
      command.reportId,
    );
    const program = await this.programsRepository.findById(report.programId);
    if (!program) {
      throw new AppException(
        'BUGBOUNTY_PROGRAM_NOT_FOUND',
        'The program this report belongs to no longer exists.',
        HttpStatus.NOT_FOUND,
      );
    }
    const finding = report.findingId
      ? await this.findingsRepository.findById(report.findingId)
      : null;

    const { issues, providerName, model } = await this.assistant.reviewQuality({
      report,
      program,
      finding,
      provider: command.data.provider,
      model: command.data.model,
    });

    const result: ReviewReportQualityResultDto = {
      issues,
      reviewedAt: new Date().toISOString(),
      aiModel: `${providerName}:${model}`,
    };

    await this.reportsRepository.update(command.reportId, {
      expectedVersion: report.version,
      technicalReview: result,
    });

    return result;
  }
}
