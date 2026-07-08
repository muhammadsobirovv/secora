import type { Tag } from '../../../../prisma-types.js';

export interface CreateTagInput {
  workspaceId: string;
  name: string;
  color?: string;
}

/// Tags are workspace-scoped and reusable across Projects/Targets — this
/// repository also owns the ProjectTag/TargetTag join tables since tagging
/// is fundamentally a Tag-side concern (attach/detach a label), not a
/// Project or Target concern; Projects/Targets depend on Tags (a
/// foundational module, like Workspaces), not the other way around.
export interface TagsRepository {
  create(input: CreateTagInput): Promise<Tag>;
  findById(id: string): Promise<Tag | null>;
  findByWorkspaceAndName(
    workspaceId: string,
    name: string,
  ): Promise<Tag | null>;
  list(workspaceId: string): Promise<Tag[]>;
  delete(id: string): Promise<void>;
  tagProject(projectId: string, tagId: string): Promise<void>;
  untagProject(projectId: string, tagId: string): Promise<void>;
  tagTarget(targetId: string, tagId: string): Promise<void>;
  untagTarget(targetId: string, tagId: string): Promise<void>;
}

export const TAGS_REPOSITORY = Symbol('TAGS_REPOSITORY');
