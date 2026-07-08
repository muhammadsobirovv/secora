import type {
  ProjectStatus,
  WorkspaceSettings,
} from '../../../../prisma-types.js';

export interface WorkspaceSettingsRepository {
  findByWorkspaceId(workspaceId: string): Promise<WorkspaceSettings | null>;
  createDefault(workspaceId: string): Promise<WorkspaceSettings>;
  update(
    workspaceId: string,
    data: Partial<{ defaultProjectStatus: ProjectStatus }>,
  ): Promise<WorkspaceSettings>;
}

export const WORKSPACE_SETTINGS_REPOSITORY = Symbol(
  'WORKSPACE_SETTINGS_REPOSITORY',
);
