import { Module } from '@nestjs/common';
import { WORKSPACES_REPOSITORY } from './domain/repositories/workspaces.repository.interface.js';
import { WORKSPACE_SETTINGS_REPOSITORY } from './domain/repositories/workspace-settings.repository.interface.js';
import { PrismaWorkspacesRepository } from './infrastructure/persistence/prisma/prisma-workspaces.repository.js';
import { PrismaWorkspaceSettingsRepository } from './infrastructure/persistence/prisma/prisma-workspace-settings.repository.js';
import { UpdateWorkspaceHandler } from './commands/update-workspace.command.js';
import { UpdateWorkspaceSettingsHandler } from './commands/update-workspace-settings.command.js';
import { UploadWorkspaceAvatarHandler } from './commands/upload-workspace-avatar.command.js';
import { GetWorkspaceHandler } from './queries/get-workspace.query.js';
import { ListWorkspaceMembersHandler } from './queries/list-workspace-members.query.js';
import { WorkspacesController } from './controllers/workspaces.controller.js';

const COMMAND_HANDLERS = [
  UpdateWorkspaceHandler,
  UpdateWorkspaceSettingsHandler,
  UploadWorkspaceAvatarHandler,
];
const QUERY_HANDLERS = [GetWorkspaceHandler, ListWorkspaceMembersHandler];

@Module({
  controllers: [WorkspacesController],
  providers: [
    {
      provide: WORKSPACES_REPOSITORY,
      useClass: PrismaWorkspacesRepository,
    },
    {
      provide: WORKSPACE_SETTINGS_REPOSITORY,
      useClass: PrismaWorkspaceSettingsRepository,
    },
    ...COMMAND_HANDLERS,
    ...QUERY_HANDLERS,
  ],
  exports: [WORKSPACES_REPOSITORY, WORKSPACE_SETTINGS_REPOSITORY],
})
export class WorkspacesModule {}
