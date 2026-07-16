import {
  CommandHandler,
  EventBus,
  ICommand,
  ICommandHandler,
} from '@nestjs/cqrs';
import { HttpStatus, Inject } from '@nestjs/common';
import type {
  BugReportDto,
  CreateBugReportRequestDto,
  SubmitBugReportRequestDto,
  UpdateBugReportRequestDto,
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
  BUG_REPORTS_REPOSITORY,
  BugReportVersionConflictError,
  type BugReportsRepository,
} from '../domain/repositories/bug-reports.repository.interface.js';
import {
  resolveBugBountyProgramForCaller,
  resolveBugReportForCaller,
} from '../authorization.util.js';
import { toBugReportDto } from '../mappers/to-bug-report-dto.mapper.js';
import {
  BountyAwardedEvent,
  BugReportAcceptedEvent,
  BugReportClosedEvent,
  BugReportCreatedEvent,
  BugReportRejectedEvent,
  BugReportSubmittedEvent,
  BugReportUpdatedEvent,
} from '../events/bug-report-events.js';

/// Wraps a repository.update() call that can throw
/// BugReportVersionConflictError, translating it into the one AppException
/// code the frontend is contracted to handle (BUG_REPORT_VERSION_CONFLICT)
/// — same "never leak a raw domain error past the repository boundary"
/// rule every other module in this codebase follows.
async function updateWithVersionGuard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof BugReportVersionConflictError) {
      throw new AppException(
        'BUG_REPORT_VERSION_CONFLICT',
        'This report was modified by someone else. Reload it and try again.',
        HttpStatus.CONFLICT,
      );
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export class CreateBugReportCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly data: CreateBugReportRequestDto,
  ) {}
}

@CommandHandler(CreateBugReportCommand)
export class CreateBugReportHandler implements ICommandHandler<
  CreateBugReportCommand,
  BugReportDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(BUGBOUNTY_PROGRAMS_REPOSITORY)
    private readonly programsRepository: BugBountyProgramsRepository,
    @Inject(BUG_REPORTS_REPOSITORY)
    private readonly reportsRepository: BugReportsRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: CreateBugReportCommand): Promise<BugReportDto> {
    const { workspaceId, program } = await resolveBugBountyProgramForCaller(
      this.workspacesRepository,
      this.programsRepository,
      command.userId,
      command.data.programId,
    );

    const report = await this.reportsRepository.create({
      workspaceId,
      projectId: program.projectId,
      programId: program.id,
      findingId: command.data.findingId,
      title: command.data.title,
      template: command.data.template,
      summary: command.data.summary,
      impact: command.data.impact,
      stepsToReproduce: command.data.stepsToReproduce,
      proofOfConcept: command.data.proofOfConcept,
      cwe: command.data.cwe,
      cvssScore: command.data.cvssScore,
      cvssVector: command.data.cvssVector,
      references: command.data.references,
      mitigation: command.data.mitigation,
      evidenceIds: command.data.evidenceIds,
      createdBy: command.userId,
    });

    this.eventBus.publish(
      new BugReportCreatedEvent(
        workspaceId,
        report.projectId,
        command.userId,
        report.id,
        { title: report.title, programId: report.programId },
      ),
    );

    const evidenceIds = await this.reportsRepository.listEvidenceIds(report.id);
    return toBugReportDto(report, evidenceIds);
  }
}

// ---------------------------------------------------------------------------
// Update — generic field edits, plus status transitions (Accepted/
// Rejected/Closed/BountyAwarded), all optimistic-lock guarded.
// ---------------------------------------------------------------------------

export class UpdateBugReportCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly reportId: string,
    public readonly data: UpdateBugReportRequestDto,
  ) {}
}

@CommandHandler(UpdateBugReportCommand)
export class UpdateBugReportHandler implements ICommandHandler<
  UpdateBugReportCommand,
  BugReportDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(BUG_REPORTS_REPOSITORY)
    private readonly reportsRepository: BugReportsRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: UpdateBugReportCommand): Promise<BugReportDto> {
    const { workspaceId, report: existing } = await resolveBugReportForCaller(
      this.workspacesRepository,
      this.reportsRepository,
      command.userId,
      command.reportId,
    );

    const previousStatus = existing.status;
    const nextStatus = command.data.status;
    const now = new Date();

    const updated = await updateWithVersionGuard(() =>
      this.reportsRepository.update(command.reportId, {
        expectedVersion: command.data.version,
        title: command.data.title,
        template: command.data.template,
        status: nextStatus,
        summary: command.data.summary,
        impact: command.data.impact,
        stepsToReproduce: command.data.stepsToReproduce,
        proofOfConcept: command.data.proofOfConcept,
        cwe: command.data.cwe,
        cvssScore: command.data.cvssScore,
        cvssVector: command.data.cvssVector,
        references: command.data.references,
        mitigation: command.data.mitigation,
        bountyAmount: command.data.bountyAmount,
        currency: command.data.currency,
        platformReportUrl: command.data.platformReportUrl,
        platformReportId: command.data.platformReportId,
        evidenceIds: command.data.evidenceIds,
        ...(nextStatus === 'TRIAGED' && previousStatus !== 'TRIAGED'
          ? { triagedAt: now }
          : {}),
        ...(nextStatus === 'RESOLVED' && previousStatus !== 'RESOLVED'
          ? { resolvedAt: now }
          : {}),
        ...(nextStatus === 'CLOSED' && previousStatus !== 'CLOSED'
          ? { closedAt: now }
          : {}),
      }),
    );

    this.eventBus.publish(
      new BugReportUpdatedEvent(
        workspaceId,
        updated.projectId,
        command.userId,
        updated.id,
      ),
    );

    if (nextStatus && nextStatus !== previousStatus) {
      if (nextStatus === 'ACCEPTED') {
        this.eventBus.publish(
          new BugReportAcceptedEvent(
            workspaceId,
            updated.projectId,
            command.userId,
            updated.id,
          ),
        );
      } else if (nextStatus === 'REJECTED') {
        this.eventBus.publish(
          new BugReportRejectedEvent(
            workspaceId,
            updated.projectId,
            command.userId,
            updated.id,
          ),
        );
      } else if (nextStatus === 'CLOSED') {
        this.eventBus.publish(
          new BugReportClosedEvent(
            workspaceId,
            updated.projectId,
            command.userId,
            updated.id,
          ),
        );
      }
    }

    if (
      command.data.bountyAmount !== undefined &&
      command.data.bountyAmount !== existing.bountyAmount
    ) {
      this.eventBus.publish(
        new BountyAwardedEvent(
          workspaceId,
          updated.projectId,
          command.userId,
          updated.id,
          {
            bountyAmount: updated.bountyAmount,
            currency: updated.currency,
          },
        ),
      );
    }

    const evidenceIds = await this.reportsRepository.listEvidenceIds(
      updated.id,
    );
    return toBugReportDto(updated, evidenceIds);
  }
}

// ---------------------------------------------------------------------------
// Submit — DRAFT -> SUBMITTED, the dedicated action (spec: "Submit
// Report" workflow step), distinct from the generic update above so
// submittedAt is always server-set and the DRAFT precondition is enforced.
// ---------------------------------------------------------------------------

export class SubmitBugReportCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly reportId: string,
    public readonly data: SubmitBugReportRequestDto,
  ) {}
}

@CommandHandler(SubmitBugReportCommand)
export class SubmitBugReportHandler implements ICommandHandler<
  SubmitBugReportCommand,
  BugReportDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(BUG_REPORTS_REPOSITORY)
    private readonly reportsRepository: BugReportsRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: SubmitBugReportCommand): Promise<BugReportDto> {
    const { workspaceId, report: existing } = await resolveBugReportForCaller(
      this.workspacesRepository,
      this.reportsRepository,
      command.userId,
      command.reportId,
    );

    if (existing.status !== 'DRAFT') {
      throw new AppException(
        'BUG_REPORT_NOT_SUBMITTABLE',
        `Report is already "${existing.status}" — only a DRAFT report can be submitted.`,
        HttpStatus.CONFLICT,
      );
    }

    const updated = await updateWithVersionGuard(() =>
      this.reportsRepository.update(command.reportId, {
        expectedVersion: command.data.version,
        status: 'SUBMITTED',
        submittedAt: new Date(),
        platformReportUrl: command.data.platformReportUrl,
        platformReportId: command.data.platformReportId,
      }),
    );

    this.eventBus.publish(
      new BugReportSubmittedEvent(
        workspaceId,
        updated.projectId,
        command.userId,
        updated.id,
      ),
    );

    const evidenceIds = await this.reportsRepository.listEvidenceIds(
      updated.id,
    );
    return toBugReportDto(updated, evidenceIds);
  }
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export class DeleteBugReportCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly reportId: string,
  ) {}
}

@CommandHandler(DeleteBugReportCommand)
export class DeleteBugReportHandler implements ICommandHandler<
  DeleteBugReportCommand,
  void
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(BUG_REPO