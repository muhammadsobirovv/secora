import { Module } from '@nestjs/common';
import { TAGS_REPOSITORY } from './domain/repositories/tags.repository.interface.js';
import { PrismaTagsRepository } from './infrastructure/persistence/prisma/prisma-tags.repository.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { CreateTagHandler, DeleteTagHandler } from './commands/tag.commands.js';
import { ListTagsHandler } from './queries/list-tags.query.js';
import { TagsController } from './controllers/tags.controller.js';

@Module({
  imports: [WorkspacesModule],
  controllers: [TagsController],
  providers: [
    { provide: TAGS_REPOSITORY, useClass: PrismaTagsRepository },
    CreateTagHandler,
    DeleteTagHandler,
    ListTagsHandler,
  ],
  exports: [TAGS_REPOSITORY],
})
export class TagsModule {}
