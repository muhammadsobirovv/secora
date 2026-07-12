import type {
  ReconJobLog,
  ReconJobLogLevel,
} from '../../../../prisma-types.js';

export interface AppendLogInput {
  jobId: string;
  toolRunId: string | null;
  level: ReconJobLogLevel;
  message: string;
}

export interface ReconJobLogsRepository {
  append(input: AppendLogInput): Promise<ReconJobLog>;
  /// Cursor-based, ordered by seq (not id/createdAt — see the ReconJobLog
  /// schema comment). sinceSeq is exclusive.
  listSince(jobId: string, sinceSeq: bigint | null): Promise<ReconJobLog[]>;
}

export const RECON_JOB_LOGS_REPOSITORY = Symbol('RECON_JOB_LOGS_REPOSITORY');
