import type {
  ReconJobStatus,
  ReconJobToolRun,
  ReconTool,
} from '../../../../prisma-types.js';

export interface CreateToolRunsInput {
  jobId: string;
  tools: ReconTool[];
}

export interface CompleteToolRunInput {
  status: Extract<ReconJobStatus, 'COMPLETED' | 'FAILED'>;
  exitCode: number | null;
  findingsCount: number;
  errorMessage: string | null;
  rawOutputEvidenceId: string | null;
}

export interface ReconJobToolRunsRepository {
  createMany(input: CreateToolRunsInput): Promise<ReconJobToolRun[]>;
  listForJob(jobId: string): Promise<ReconJobToolRun[]>;
  findNextPending(jobId: string): Promise<ReconJobToolRun | null>;
  markStarted(id: string): Promise<ReconJobToolRun>;
  markComplete(
    id: string,
    input: CompleteToolRunInput,
  ): Promise<ReconJobToolRun>;
}

export const RECON_JOB_TOOL_RUNS_REPOSITORY = Symbol(
  'RECON_JOB_TOOL_RUNS_REPOSITORY',
);
