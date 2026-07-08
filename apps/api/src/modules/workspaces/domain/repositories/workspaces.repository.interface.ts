import type {
  Workspace,
  WorkspaceMemberRole,
} from '../../../../prisma-types.js';

export interface CreateWorkspaceInput {
  name: string;
  slug: string;
}

/// Membership foundation only — invites, switching, multi-member
/// workflows are future-module work. This sprint creates a personal
/// Workspace at register time (docs/adr/0001-auth-module.md) and adds
/// settings/avatar/member-listing (docs/adr/0002-workspace-foundation-module.md).
export interface WorkspacesRepository {
  create(input: CreateWorkspaceInput): Promise<Workspace>;
  addMember(
    workspaceId: string,
    userId: string,
    role: WorkspaceMemberRole,
  ): Promise<void>;
  findById(id: string): Promise<Workspace | null>;
  /// Resolves "the workspace this user acts in" — every user has exactly
  /// one (their personal workspace, created at registration) this sprint;
  /// no workspace-switching exists yet, so this is the sole resolution
  /// path every Project/Target/Note/... command uses instead of trusting
  /// a client-supplied workspaceId.
  findPersonalWorkspaceForUser(userId: string): Promise<Workspace | null>;
  update(
    id: string,
    data: Partial<Pick<Workspace, 'name' | 'description' | 'avatarUrl'>>,
  ): Promise<Workspace>;
  listMembers(workspaceId: string): Promise<
    Array<{
      userId: string;
      role: WorkspaceMemberRole;
      joinedAt: Date;
    }>
  >;
  isMember(workspaceId: string, userId: string): Promise<boolean>;
}

export const WORKSPACES_REPOSITORY = Symbol('WORKSPACES_REPOSITORY');
