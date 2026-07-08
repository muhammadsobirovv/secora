import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { SEARCH_SERVICE } from './domain/search-service.interface.js';
import { PrismaIlikeSearchService } from './infrastructure/prisma-ilike-search.service.js';
import { SearchHandler } from './queries/search.query.js';
import { SearchController } from './controllers/search.controller.js';

@Module({
  imports: [WorkspacesModule],
  controllers: [SearchController],
  providers: [
    { provide: SEARCH_SERVICE, useClass: PrismaIlikeSearchService },
    SearchHandler,
  ],
})
export class SearchModule {}
