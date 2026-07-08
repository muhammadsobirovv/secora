import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { TagsModule } from '../tags/tags.module.js';
import { TARGETS_REPOSITORY } from './domain/repositories/targets.repository.interface.js';
import { PrismaTargetsRepository } from './infrastructure/persistence/prisma/prisma-targets.repository.js';
import { CreateTargetHandler } from './commands/create-target.command.js';
import {
  UpdateTargetHandler,
  DeleteTargetHandler,
} from './commands/target-lifecycle.commands.js';
import {
  TagTargetHandler,
  UntagTargetHandler,
} from './commands/target-tags.commands.js';
import {
  GetTargetHandler,
  ListTargetsHandler,
} from './queries/target.queries.js';
import { TargetsController } from './controllers/targets.controller.js';
import { ProjectTargetsController } from './controllers/project-targets.controller.js';

@Module({
  imports: [WorkspacesModule, ProjectsModule, TagsModule],
  controllers: [TargetsController, ProjectTargetsController],
  providers: [
    { provide: TARGETS_REPOSITORY, useClass: PrismaTargetsRepository },
    CreateTargetHandler,
    UpdateTargetHandler,
    DeleteTargetHandler,
    TagTargetHandler,
    UntagTargetHandler,
    GetTargetHandler,
    ListTargetsHandler,
  ],
  exports: [TARGETS_REPOSITORY],
})
export class TargetsModule {}
