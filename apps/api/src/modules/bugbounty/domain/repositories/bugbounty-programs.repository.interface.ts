import type {
  BugBountyProgram,
  BugBountyProgramScopeItem,
  BugBountyProgramTarget,
  BugBountyPlatform,
  BugBountyProgramStatus,
  ScopeItemType,
  ScopeClassification,
} from '../../../../prisma-types.js';

export interface ListBugBountyProgramsFilter {
  workspaceId: string;
  projectId?: string;
  platform?: BugBountyPlatform;
  status?: BugBountyProgramStatus;
  search?: string;
}

export interface CreateBugBountyProgramInput {
  workspaceId: string;
  projectId?: string | null;
  name: string;
  platform: BugBountyPlatform;
  organization?: string | null;
  url?: string | null;
  status?: BugBountyProgramStatus;
  rulesMarkdown?: string | null;
  bountyTable?: Record<string, unknown> | null;
  severityMatrix?: Record<string, unknown> | null;
  disclosurePolicy?: string | null;
  notesMarkdown?: string | null;
  tags?: string[];
  createdBy: string;
}

export type UpdateBugBountyProgramInput = Partial<
  Omit<CreateBugBountyProgramInput, 'workspaceId' | 'createdBy'>
>;

export interface CreateScopeItemInput {
  programId: string;
  type: ScopeItemType;
  pattern: string;
  classification?: ScopeClassification;
  notes?: string | null;
}

export interface UpdateScopeItemInput {
  classification?: ScopeClassification;
  notes?: string | null;
}

/// Programs, their Scope Items, and their Target links are one aggregate —
/// a program without scope/targets is meaningless, so one repository
/// (mirrors how VulnScanJob + VulnScanJobToolRun + VulnScanJobLog share
/// VulnScanJobsRepository rather than being split three ways).
export interface BugBountyProgramsRepository {
  create(input: CreateBugBountyProgramInput): Promise<BugBountyProgram>;
  findById(id: string): Promise<BugBountyProgram | null>;
  findByIdForWorkspace(
    id: string,
    workspaceId: string,
  ): Promise<BugBountyProgram | null>;
  list(filter: ListBugBountyProgramsFilter): Promise<BugBountyProgram[]>;
  update(
    id: string,
    input: UpdateBugBountyProgramInput,
  ): Promise<BugBountyProgram>;
  softDelete(id: string): Promise<void>;

  // Scope items
  addScopeItem(input: CreateScopeItemInput): Promise<BugBountyProgramScopeItem>;
  updateScopeItem(
    id: string,
    input: UpdateScopeItemInput,
  ): Promise<BugBountyProgramScopeItem>;
  removeScopeItem(id: string): Promise<void>;
  listScopeItems(programId: string): Promise<BugBountyProgramScopeItem[]>;
  findScopeItemById(id: string): Promise<BugBountyProgramScopeItem | null>;

  // Program <-> Target links
  linkTarget(
    programId: string,
    targetId: string,
  ): Promise<BugBountyProgramTarget>;
  unlinkTarget(programId: string, targetId: string): Promise<void>;
  listLinkedTargetIds(programId: string): Promise<string[]>;
  listProgramIdsForTarget(targetId: string): Promise<string[]>;

  countScopeItems(programId: string): Promise<number>;
  countLinkedTargets(programId: string): Promise<number>;
}

export const BUGBOUNTY_PROGRAMS_RE