import type { SubmissionDto, RewardLedgerEntryDto } from '@pentesthub/shared';
import type { RewardLedgerEntry, Submission } from '../../../prisma-types.js';

export function toSubmissionDto(submission: Submission): SubmissionDto {
  return {
    id: submission.id,
    programId: submission.programId,
    findingId: submission.findingId,
    bugReportId: submission.bugReportId,
    title: submission.title,
    severity: submission.severity,
    status: submission.status as SubmissionDto['status'],
    submittedAt: submission.submittedAt ? submission.submittedAt.toISOString() : null,
    responseAt: submission.responseAt ? submission.responseAt.toISOString() : null,
    reward: submission.reward,
    currency: submission.currency,
    platform: submission.platform,
    externalId: submission.externalId,
    externalUrl: submission.externalUrl,
    notes: submission.notes,
    createdAt: submission.createdAt.toISOString(),
    updatedAt: submission.updatedAt.toISOString(),
  };
}

export function toRewardLedgerEntryDto(entry: RewardLedgerEntry): RewardLedgerEntryDto {
  return {
    id: entry.id,
    submissionId: entry.submissionId,
    programId: entry.programId,
    amount: entry.amount,
    currency: entry.currency,
    feeAmount: entry.feeAmount,
    netAmount: entry.netAmount,
    occurredAt: entry.occurredAt.toISOString(),
    notes: entry.notes,
  };
}
