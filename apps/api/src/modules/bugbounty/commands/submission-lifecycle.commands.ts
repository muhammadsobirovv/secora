import {
  CommandHandler,
  EventBus,
  ICommand,
  ICommandHandler,
} from '@nestjs/cqrs';
import { HttpStatus, Inject } from '@nestjs/common';
import type {
  CreateSubmissionRequestDto,
  SubmissionDto,
  UpdateSubmissionStatusRequestDto,
} from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  BUGBOUNTY_FINDINGS_REPOSITORY,
  type BugBountyFindingsRepository,
} from '../domain/repositories/bugbounty-findings.repository.interface.js';
import {
  SUBMISSIONS_REPOSITORY,
  type SubmissionsRepository,
} from '../domain/repositories/submissions.repository.interface.js';
import { resolveBugBountyFindingForCaller } from '../authorization.util.js';
import { toSubmissionDto } from '../mappers/to-submission-dto.mapper.js';
import {
  SubmissionCreatedEvent,
  SubmissionRewardRecordedEvent,
  SubmissionStatusChangedEvent,
} from '../events/submission-events.js';

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export class CreateSubmissionCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly data: CreateSubmissionRequestDto,
  ) {}
}

/// The security-critical handler for task #385: "Never allow submission
/// creation for a finding belonging to another workspace." Note that
/// CreateSubmissionRequestDto deliberately has no `programId` field (see
/// @pentesthub/shared/bugbounty-submissions.ts) — programId/projectId/
/// workspaceId are *derived* below from the finding the caller is
/// authorized to see via resolveBugBountyFindingForCaller (which 404s,
/// not 403s, for a finding in another workspace — enumeration-safe, same
/// pattern as every other Module 6 command). A client cannot smuggle a
/// mismatched workspaceId/programId through the request body because
/// those fields are never read from `command.data` in the first place.
@CommandHandler(CreateSubmissionCommand)
export class CreateSubmissionHandler implements ICommandHandler<
  CreateSubmissionCommand,
  SubmissionDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(BUGBOUNTY_FINDINGS_REPOSITORY)
    private readonly findingsRepository: BugBountyFindingsRepository,
    @Inject(SUBMISSIONS_REPOSITORY)
    private readonly submissionsRepository: SubmissionsRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: CreateSubmissionCommand): Promise<SubmissionDto> {
    const { workspaceId, finding } = await resolveBugBountyFindingForCaller(
      this.workspacesRepository,
      this.findingsRepository,
      command.userId,
      command.data.findingId,
    );

    if (!finding.programId) {
      throw new AppException(
        'INVALID_REFERENCE',
        'Finding is not linked to a program — cannot create a submission.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const submission = await this.submissionsRepository.create({
      workspaceId,
      projectId: finding.projectId,
      programId: finding.programId,
      findingId: finding.id,
      bugReportId: command.data.bugReportId ?? null,
      title: command.data.title,
      severity: command.data.severity,
      platform: command.data.platform,
      externalId: command.data.externalId ?? null,
      externalUrl: command.data.externalUrl ?? null,
      notes: command.data.notes ?? null,
      createdBy: command.userId,
    });

    this.eventBus.publish(
      new SubmissionCreatedEvent(
        workspaceId,
        finding.projectId,
        command.userId,
        submission.id,
        { findingId: finding.id, programId: finding.programId, platform: submission.platform },
      ),
    );

    return toSubmissionDto(submission);
  }
}

// ---------------------------------------------------------------------------
// Update status (+ reward tracking)
// ---------------------------------------------------------------------------

const TERMINAL_SUBMISSION_STATUSES = new Set(['CLOSED']);

const REWARD_ELIGIBLE_STATUSES = new Set(['ACCEPTED', 'RESOLVED', 'BOUNTY_PAID']);

export class UpdateSubmissionStatusCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly submissionId: string,
    public readonly data: UpdateSubmissionStatusRequestDto,
  ) {}
}

/// A BOUNTY_PAID transition (or any transition that sets/updates `reward`)
/// writes a RewardLedgerEntry row — the append-only ledger the Rewards
/// analytics query aggregates over — in addition to updating the
/// Submission row itself. Ownership is resolved via
/// SubmissionsRepository.findByIdForWorkspace after resolving the
/// caller's own workspace, the same enumeration-safe 404 pattern as
/// every other Module 6/16 lifecycle handler; the workspace a submission
/// belongs to is never taken from client input.
@CommandHandler(UpdateSubmissionStatusCommand)
export class UpdateSubmissionStatusHandler implements ICommandHandler<
  UpdateSubmissionStatusCommand,
  SubmissionDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(SUBMISSIONS_REPOSITORY)
    private readonly submissionsRepository: SubmissionsRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: UpdateSubmissionStatusCommand): Promise<SubmissionDto> {
    const workspace = await this.workspacesRepository.findPersonalWorkspaceForUser(
      command.userId,
    );
    if (!workspace) {
      throw new AppException('WORKSPACE_NOT_FOUND', 'Workspace not found.', HttpStatus.NOT_FOUND);
    }

    const existing = await this.submissionsRepository.findByIdForWorkspace(
      command.submissionId,
      workspace.id,
    );
    if (!existing) {
      throw new AppException('SUBMISSION_NOT_FOUND', 'Submission not found.', HttpStatus.NOT_FOUND);
    }

    if (TERMINAL_SUBMISSION_STATUSES.has(existing.status) && existing.status !== 'REOPENED') {
      // CLOSED is terminal but REOPENED is the explicit, intentional way
      // back out of it — any other transition attempted from CLOSED is
      // rejected rather than silently allowed.
      if (command.data.status !== 'REOPENED') {
        throw new AppException(
          'SUBMISSION_INVALID_STATE_TRANSITION',
          `Submission is CLOSED — reopen it explicitly (status: REOPENED) before applying any other transition.`,
          HttpStatus.CONFLICT,
        );
      }
    }

    const now = new Date();
    const isFirstResponse =
      !existing.responseAt && command.data.status !== 'DRAFT' && command.data.status !== 'SUBMITTED';

    const updated = await this.submissionsRepository.updateStatus(existing.id, {
      status: command.data.status,
      submittedAt:
        command.data.status === 'SUBMITTED' && !existing.submittedAt ? now : undefined,
      responseAt: command.data.responseAt
        ? new Date(command.data.responseAt)
        : isFirstResponse
          ? now
          : undefined,
      reward: command.data.reward !== undefined ? command.data.reward : undefined,
      currency: command.data.currency !== undefined ? command.data.currency : undefined,
      notes: command.data.notes !== undefined ? command.data.notes : undefined,
    });

    this.eventBus.publish(
      new SubmissionStatusChangedEvent(
        workspace.id,
        updated.projectId,
        command.userId,
        updated.id,
        { fromStatus: existing.status, toStatus: updated.status },
      ),
    );

    // Reward ledger: only when a reward amount is present and the status
    // reflects an actual payout/acceptance outcome — never write a ledger
    // row for a bare status change with no reward attached.
    const rewardAmount = command.data.reward ?? updated.reward;
    if (
      rewardAmount !== null &&
      rewardAmount !== undefined &&
      rewardAmount > 0 &&
      REWARD_ELIGIBLE_STATUSES.has(updated.status) &&
      command.data.reward !== undefined
    ) {
      const currency = updated.currency ?? 'USD';
      // Module 16 spec: Reward, Currency, Platform Fee, Net Reward. No
      // platform-fee input exists yet on UpdateSubmissionStatusRequestDto,
      // so feeAmount defaults to 0 (net === gross) — a future Program-level
      // "default platform fee %" setting can compute this without changing
      // this handler's contract.
      const feeAmount = 0;
      const netAmount = rewardAmount - feeAmount;

      await this.submissionsRepository.createRewardLedgerEntry({
        workspaceId: workspace.id,
        submissionId: updated.id,
        programId: updated.programId,
        amount: rewardAmount,
        currency,
        feeAmount,
        netAmount,
        notes: `Recorded via status transition to ${updated.status}`,
      });

      this.eventBus.publish(
        new SubmissionRewardRecordedEvent(
          workspace.id,
          updated.projectId,
          command.userId,
          updated.id,
          { amount: rewardAmount, currency, netAmount },
        ),
      );
    }

    return toSubmissionDto(updated);
  }
}
