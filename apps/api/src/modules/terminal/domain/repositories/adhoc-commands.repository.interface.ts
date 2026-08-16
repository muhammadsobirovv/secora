import type { AdHocCommand } from '../../../../prisma-types.js';

export interface CreateAdHocCommandInput {
  workspaceId: string;
  projectId: string;
  targetId: string;
  tool: string;
  kind: 'RECON_TOOL' | 'VULN_SCANNER';
  argsSummary: string | null;
  classification: string;
  status: string;
  approvalRequestId?: string | null;
  rejectionReason?: string | null;
  requestedBy: string;
  source: string;
  researchSessionId?: string | null;
}

export interface UpdateAdHocCommandInput {
  status?: string;
  exitCode?: number | null;
  stdout?: string | null;
  stderr?: string | null;
  rejectionReason?: string | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  durationMs?: number | null;
}

export interface ListAdHocCommandsFilter {
  workspaceId: string;
  requestedBy: string;
  targetId?: string;
  status?: string;
  limit?: number;
}

export interface AdHocCommandsRepository {
  create(input: CreateAdHocCommandInput): Promise<AdHocCommand>;
  findById(id: string): Promise<AdHocCommand | null>;
  /// Enumeration-safe lookup — scoped to BOTH workspace and requestedBy,
  /// so "another user's terminal history" and "a nonexistent id" resolve
  /// identically (see terminal.controller.ts).
  findByIdForCaller(id: string, workspaceId: string, requestedBy: string): Promise<AdHocCommand | null>;
  update(id: string, input: UpdateAdHocCommandInput): Promise<AdHocCommand>;
  list(filter: ListAdHocCommandsFilter): Promise<AdHocCommand[]>;
}

export const ADHOC_COMMANDS_REPOSITORY = Symbol('ADHOC_COMMANDS_REPOSITORY');
