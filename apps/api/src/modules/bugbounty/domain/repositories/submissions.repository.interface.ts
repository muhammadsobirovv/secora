import type { Submission, RewardLedgerEntry, SubmissionStatus } from '../../../../prisma-types.js';
import type { BugBountyPlatform, VulnFindingSeverity } from '@pentesthub/shared';

/// Module 16 — Bug Bounty Submissions + Rewards (task #385). Mirrors the
/// shape/conventions of BugBountyFindingsRepository — see that file's doc
/// comment. A Submission always belongs to exactly one workspace/program/
/// finding; `CreateSubmissionInput.workspaceId/projectId/programId` are
/// never accepted from the client directly — every command handler in
/// submission-lifecycle.commands.ts derives them server-side from the
/// resolved Finding (via resolveBugBountyFindingForCaller), never from a
/// client-supplied field, so a submission can never be created against a
/// finding that belongs to another workspace.
export interface CreateSubmissionInput {
  workspaceId: string;
  projectId: string;
  programId: string;
  findingId: string;
  bugReportId?: string | null;
  title: string;
  severity: VulnFindingSeverity;
  platform: BugBountyPlatform;
  externalId?: string | null;
  externalUrl?: string | null;
  notes?: string | null;
  createdBy: string;
}

export interface UpdateSubmissionStatusInput {
  status: SubmissionStatus;
  submittedAt?: Date | null;
  responseAt?: Date | null;
  reward?: number | null;
  currency?: string | null;
  notes?: string | null;
}

export interface ListSubmissionsFilter {
  workspaceId: string;
  programId?: string;
  findingId?: string;
  status?: SubmissionStatus;
  limit?: number;
}

export interface CreateRewardLedgerEntryInput {
  workspaceId: string;
  submissionId: string;
  programId: string;
  amount: number;
  currency: string;
  feeAmount: number;
  netAmount: number;
  occurredAt?: Date;
  notes?: string | null;
}

/// Narrow projection used by GetRewardAnalyticsHandler — avoids pulling
/// full Submission rows (description-length fields, etc.) into an
/// aggregation pass over potentially thousands of rows.
export interface SubmissionAnalyticsProjection {
  id: string;
  status: string;
  createdAt: Date;
  submittedAt: Date | null;
  responseAt: Date | null;
  /// Submission has no dedicated `resolvedAt` column — GetRewardAnalyticsHandler
  /// uses `updatedAt` as the resolution timestamp for RESOLVED/BOUNTY_PAID/
  /// CLOSED rows, which is an approximation (any later edit to a resolved
  /// submission would also move it) rather than an exact "moment it
  /// resolved" — disclosed in that handler's doc comment too.
  updatedAt: Date;
}

export interface SubmissionsRepository {
  create(input: CreateSubmissionInput): Promise<Submission>;
  findById(id: string): Promise<Submission | null>;
  findByIdForWorkspace(id: string, workspaceId: string): Promise<Submission | null>;
  list(filter: ListSubmissionsFilter): Promise<Submission[]>;
  updateStatus(
    id: string,
    input: UpdateSubmissionStatusInput,
  ): Promise<Submission>;

  createRewardLedgerEntry(
    input: CreateRewardLedgerEntryInput,
  ): Promise<RewardLedgerEntry>;
  listRewardLedgerForWorkspace(
    workspaceId: string,
    since?: Date,
  ): Promise<RewardLedgerEntry[]>;

  /// Every submission ever created in this workspace (not soft-deletable —
  /// Submission has no deletedAt column), for the Accepted/Duplicate-rate/
  /// average-response/resolution-time analytics in GetRewardAnalyticsHandler.
  listAnalyticsProjection(
    workspaceId: string,
  ): Promise<SubmissionAnalyticsProjection[]>;
}

export const SUBMISSIONS_REPOSITORY = Symbol('SUBMISSIONS_REPOSITORY');
