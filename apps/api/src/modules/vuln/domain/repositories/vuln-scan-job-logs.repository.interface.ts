import type {
  VulnScanJobLog,
  VulnScanJobLogLevel,
} from '../../../../prisma-types.js';

export interface AppendLogInput {
  jobId: string;
  toolRunId: string | null;
  level: VulnScanJobLogLevel;
  message: string;
}

export interface VulnScanJobLogsRepository {
  append(input: AppendLogInput): Promise<VulnScanJobLog>;
  /// Cursor-based, ordered by seq — see VulnScanJobLog schema comment.
  /// sinceSeq is exclusive.
  listSince(jobId: string, sinceSeq: bigint | null): Promise<VulnScanJobLog[]>;
}

export const VULN_SCAN_JOB_LOGS_REPOSITORY = Symbol(
  'VULN_SCAN_JOB_LOGS_REPOSITORY',
);
