// Module 16 — Bug Bounty Submissions + reward tracking (task #385).

export type SubmissionStatus =
  | "DRAFT" | "SUBMITTED" | "TRIAGED" | "INFORMATIVE" | "DUPLICATE" | "NOT_APPLICABLE"
  | "ACCEPTED" | "RESOLVED" | "BOUNTY_PAID" | "CLOSED" | "REOPENED";

export interface SubmissionDto {
  id: string;
  programId: string;
  findingId: string;
  bugReportId: string | null;
  title: string;
  severity: string;
  status: SubmissionStatus;
  submittedAt: string | null;
  responseAt: string | null;
  reward: number | null;
  currency: string | null;
  platform: string;
  externalId: string | null;
  externalUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSubmissionRequestDto {
  findingId: string;
  title: string;
  severity: string;
  bugReportId?: string;
  platform: string;
  externalId?: string;
  externalUrl?: string;
  notes?: string;
}

export interface UpdateSubmissionStatusRequestDto {
  status: SubmissionStatus;
  responseAt?: string;
  reward?: number;
  currency?: string;
  notes?: string;
}

export interface RewardLedgerEntryDto {
  id: string;
  submissionId: string | null;
  programId: string;
  amount: number;
  currency: string;
  feeAmount: number | null;
  netAmount: number;
  occurredAt: string;
  notes: string | null;
}

export interface RewardTotalsDto {
  currency: string;
  monthly: { period: string; totalNet: number }[];
  yearly: { period: string; totalNet: number }[];
  allTimeNet: number;
}

/// Module 16 — task #385. The Reward-tracking analytics the spec calls
/// out by name: Total Rewards, Monthly Rewards, Yearly Rewards, Accepted
/// Findings, Duplicate Rate, Average Time to Response, Average Time to
/// Resolution. Wraps RewardTotalsDto rather than duplicating its
/// monthly/yearly breakdown.
export interface SubmissionAnalyticsDto {
  rewards: RewardTotalsDto;
  totalSubmissions: number;
  acceptedFindings: number;
  duplicateFindings: number;
  duplicateRatePercent: number | null;
  averageTimeToResponseHours: number | null;
  averageTimeToResolutionHours: number | null;
}

export interface ResearchAnalyticsSummaryDto {
  programs: number;
  targets: number;
  assets: number;
  findings: number;
  acceptedFindings: number;
  duplicateFindings: number;
  averageTimeToValidateHours: number | null;
  averageTimeToResolutionHours: number | null;
  totalRewards: number;
  successRatePercent: number | null;
  severityDistribution: Record<string, number>;
}
