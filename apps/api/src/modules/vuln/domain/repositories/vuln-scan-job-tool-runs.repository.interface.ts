import type {
  VulnScanJobStatus,
  VulnScanJobToolRun,
  VulnScanner,
} from '../../../../prisma-types.js';

export interface CreateToolRunsInput {
  jobId: string;
  scanners: VulnScanner[];
}

export interface CompleteToolRunInput {
  status: Extract<VulnScanJobStatus, 'COMPLETED' | 'FAILED'>;
  exitCode: number | null;
  findingsCount: number;
  errorMessage: string | null;
  rawOutputEvidenceId: string | null;
}

export interface VulnScanJobToolRunsRepository {
  createMany(input: CreateToolRunsInput): Promise<VulnScanJobToolRun[]>;
  listForJob(jobId: string): Promise<VulnScanJobToolRun[]>;
  markStarted(id: string): Promise<VulnScanJobToolRun>;
  markComplete(
    id: string,
    input: CompleteToolRunInput,
  ): Promise<VulnScanJobToolRun>;
}

export const VULN_SCAN_JOB_TOOL_RUNS_REPOSITORY = Symbol(
  'VULN_SCAN_JOB_TOOL_RUNS_REPOSITORY',
);
