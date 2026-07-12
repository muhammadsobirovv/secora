import type {
  Target,
  TargetEnvironment,
  TargetScopeStatus,
  TargetType,
  Tag,
} from '../../../../prisma-types.js';

export type TargetWithTags = Target & { tags: Tag[] };

export interface CreateTargetInput {
  projectId: string;
  type: TargetType;
  value: string;
  name?: string;
  description?: string;
  environment?: TargetEnvironment;
  scopeStatus?: TargetScopeStatus;
  createdBy: string;
}

export interface UpdateTargetInput {
  value?: string;
  name?: string;
  description?: string;
  environment?: TargetEnvironment;
  scopeStatus?: TargetScopeStatus;
}

export interface ListTargetsFilter {
  projectId: string;
  type?: TargetType;
  scopeStatus?: TargetScopeStatus;
  tagId?: string;
}

/// Pure CRUD over a typed string + metadata
/// (docs/adr/0002-workspace-foundation-module.md). Recon (Module 3) is a
/// consumer like any other — PromoteFindingToTargetCommand calls create()
/// the same way a user-driven "add target" flow would, since a promoted
/// finding is just a normal Target from every other module's perspective.
export interface TargetsRepository {
  create(input: CreateTargetInput): Promise<Target>;
  findById(id: string): Promise<TargetWithTags | null>;
  findByIdForProject(
    id: string,
    projectId: string,
  ): Promise<TargetWithTags | null>;
  update(id: string, data: UpdateTargetInput): Promise<Target>;
  softDelete(id: string): Promise<Target>;
  list(filter: ListTargetsFilter): Promise<TargetWithTags[]>;
}

export const TARGETS_REPOSITORY = Symbol('TARGETS_REPOSITORY');
