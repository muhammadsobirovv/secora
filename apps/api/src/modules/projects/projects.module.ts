import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { TagsModule } from '../tags/tags.module.js';
import { PROJECTS_REPOSITORY } from './domain/repositories/projects.repository.interface.js';
import { PROJECT_MEMBERS_REPOSITORY } from './domain/repositories/project-members.repository.interface.js';
import { PROJECT_FAVORITES_REPOSITORY } from './domain/repositories/project-favorites.repository.interface.js';
import { PrismaProjectsRepository } from './infrastructure/persistence/prisma/prisma-projects.repository.js';
import { PrismaProjectMembersRepository } from './infrastructure/persistence/prisma/prisma-project-members.repository.js';
import { PrismaProjectFavoritesRepository } from './infrastructure/persistence/prisma/prisma-project-favorites.repository.js';
import { CreateProjectHandler } from './commands/create-project.command.js';
import { UpdateProjectHandler } from './commands/update-project.command.js';
import {
  ArchiveProjectHandler,
  DeleteProjectHandler,
  FavoriteProjectHandler,
  RestoreProjectHandler,
  UnfavoriteProjectHandler,
} from './commands/project-lifecycle.commands.js';
import {
  AddProjectMemberHandler,
  RemoveProjectMemberHandler,
} from './commands/project-members.commands.js';
import {
  TagProjectHandler,
  UntagProjectHandler,
} from './commands/project-tags.commands.js';
import { GetProjectHandler } from './queries/get-project.query.js';
import { ListProjectsHandler } from './queries/list-projects.query.js';
import { ListProjectMembersHandler } from './queries/list-project-members.query.js';
import { ProjectsController } from './controllers/projects.controller.js';

const COMMAND_HANDLERS = [
  CreateProjectHandler,
  UpdateProjectHandler,
  ArchiveProjectHandler,
  RestoreProjectHandler,
  DeleteProjectHandler,
  FavoriteProjectHandler,
  UnfavoriteProjectHandler,
  AddProjectMemberHandler,
  RemoveProjectMemberHandler,
  TagProjectHandler,
  UntagProjectHandler,
];
const QUERY_HANDLERS = [
  GetProjectHandler,
  ListProjectsHandler,
  ListProjectMembersHandler,
];

@Module({
  imports: [WorkspacesModule, TagsModule],
  controllers: [ProjectsController],
  providers: [
    { provide: PROJECTS_REPOSITORY, useClass: PrismaProjectsRepository },
    {
      provide: PROJECT_MEMBERS_REPOSITORY,
      useClass: PrismaProjectMembersRepository,
    },
    {
      provide: PROJECT_FAVORITES_REPOSITORY,
      useClass: PrismaProjectFavoritesRepository,
    },
    ...COMMAND_HANDLERS,
    ...QUERY_HANDLERS,
  ],
  exports: [
    PROJECTS_REPOSITORY,
    PROJECT_MEMBERS_REPOSITORY,
    PROJECT_FAVORITES_REPOSITORY,
  ],
})
export class ProjectsModule {}
