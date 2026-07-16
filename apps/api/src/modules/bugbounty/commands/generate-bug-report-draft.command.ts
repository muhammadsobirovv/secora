import {
  CommandHandler,
  EventBus,
  ICommand,
  ICommandHandler,
} from '@nestjs/cqrs';
import { HttpStatus, Inject } from '@nestjs/common';
import type {
  GenerateBugReportDraftRequestDto,
  GenerateBugReportDraftResultDto,
} from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  BUG_REPORTS_REPOSITORY,
  BugReportVersionConflictError,
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
import { toBugReportDto } from '../mappers/to-bug-report-dto.mapper.js';
import { BugReportUpdatedEvent } from '../events/bug-report-events.js';
import { ReportDraftAssistantService } from '../reports/report-draft-assistant.service.js';

export class GenerateBugReportDraftCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly reportId: string,
    public readonly data: GenerateBugReportDraftRequestDto,
  ) {}
}

/// AI integration for the Bug Report Generator (spec: "Report Draft
/// Assistant"). Reuses the exact same AiProviderRegistryService /
/// collectStreamedCompletion / AiPromptBuilderService seam Module 5's
/// draft_report tool uses — no new AI plumbing, just a Module
/// 6-specific structured-JSON prompt and a persist step. The report's
/// `risk` field returned to the caller is display-only: BugReport has no
/// dedicated risk column, so it's folded into nothing (not persisted) —
/// only executiveSummary/technicalDetails/impact/remediation/references
/// map onto stored columns (summary/stepsToReproduce/impact/mitigation/
/// references).
@CommandHandler(GenerateBugReportDraftCommand)
export class GenerateBugReportDraftHandler implements ICommandHandler<
  GenerateBugReportDraftCommand,
  GenerateBugReportDraftResultDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(BUG_REPORTS_REPOSITORY)
    private readonly reportsRepository: BugReportsRepository,
    @Inject(BUGBOUNTY_PROGRAMS_REPOSITORY)
    private readonly programsRepository: BugBountyProgramsRepository,
    @Inject(BUGBOUNTY_FINDINGS_REPOSITORY)
    private readonly findingsRepository: BugBountyFindingsRepository,
    private readonly draftAssistant: ReportDraftAssistantService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(
    command: GenerateBugReportDraftCommand,
  ): Promise<GenerateBugReportDraftResultDto> {
    const { workspaceId, report } = await resolveBugReportForCaller(
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

    const { fields, model } = await this.draftAssistant.generateDraft({
      report,
      program,
      finding,
      provider: command.data.provider,
      model: command.data.model,
    });

    const updated = await this.reportsRepository
      .update(command.reportId, {
        expectedVersion: report.version,
        summary: fields.executiveSummary || report.summary,
        stepsToReproduce: fields.technicalDetails || report.stepsToReproduce,
        impact: fields.impact || report.impact,
        mitigation: fields.remediation || report.mitigation,
        references: fields.references.length
          ? fields.references
          : report.references,
        aiGenerated: true,
        aiModel: model,
        aiGeneratedAt: new Date(),
      })
      .catch((error: unknown) => {
        if (error instanceof BugReportVersionConflictError) {
          throw new AppException(
            'BUG_REPORT_VERSION_CONFLICT',
            'This report was modified by someone else. Reload it and try again.',
            HttpStatus.CONFLICT,
          );
        }
        throw error;
      });

    this.eventBus.publish(
      new BugReportUpdatedEvent(
        workspaceId,
        updated.projectId,
        command.userId,
        updated.id,
        {
          aiGenerated: true,
          aiModel: model,
        },
      ),
    );

    const evidenceIds = await this.reportsRepository.listEvidenceIds(
      updated.id,
    );
    return {
      report: toBugReportDto(updated, evidenceIds),
      executiveSummary: fields.executiveSummary,
      technicalDetails: fields.technicalDetails,
      impact: fields.impact,
      risk: fields.risk,
      remediation: fields.remediation,
      references: fields.references,
    };
  }
}
