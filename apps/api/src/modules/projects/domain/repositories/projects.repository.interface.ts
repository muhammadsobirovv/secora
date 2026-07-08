import type {
  Project,
  ProjectStatus,
  ProjectVisibility,
  Tag,
} from '../../../../prisma-types.js';

/// The repository joins Tag through ProjectTag itself (infrastructure
/// layer querying its own schema, not a cross-module dependency on the
/// tags feature module — see docs/adr/0002-workspace-foundation-module.md,
/// Decision 6) so callers get a ready-to-map shape without an extra round
/// trip.
export type ProjectWithTags = Project & { tags: Tag[] };

export interface CreateProjectInput {
  workspaceId: string;
  name: string;
  description?: string;
  status?: ProjectStatus;
  visibility?: ProjectVisibility;
  createdBy: string;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  status?: ProjectStatus;
  visibility?: ProjectVisibility;
}

export interface ListProjectsFilter {
  workspaceId: string;
  status?: ProjectStatus;
  tagId?: string;
  /// When set, only projects favorited by this user are returned — the
  /// filter is a userId, not a boolean, since favorites are per-user.
  favoritedByUserId?: string;
}

/// `deletedAt` (soft delete) is independent of `status`; every method
/// here implicitly filters `deletedAt: null` unless noted otherwise.
export interface ProjectsRepository {
  create(input: CreateProjectInput): Promise<Project>;
  findById(id: string): Promise<ProjectWithTags | null>;
  /// Scopes the lookup to a workspace in the same query, so "project
  /// exists but belongs to someone else's workspace" and "project
  /// doesn't exist" both resolve to `null` — the same enumeration-safe
  /// shape, used by every command/query that needs an authorization
  /// check before acting on a project.
  findByIdForWorkspace(
    id: string,
    workspaceId: string,
  ): Promise<ProjectWithTags | null>;
  /// Used only by the restore flow, which needs to see soft-deleted rows
  /// to validate/act on them — every other read filters deletedAt: null.
  findByIdIncludingDeleted(id: string): Promise<Project | null>;
  update(id: string, data: UpdateProjectInput): Promise<Project>;
  archive(id: string): Promise<Project>;
  restore(id: string): Promise<Project>;
  softDelete(id: string): Promise<Project>;
  list(filter: ListProjectsFilter): Promise<ProjectWithTags[]>;
}

export const PROJECTS_REPOSITORY = Symbol('PROJECTS_REPOSITORY');
