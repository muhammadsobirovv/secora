import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { SEARCH_SERVICE } from './domain/search-service.interface.js';
import { PrismaIlikeSearchService } from './infrastructure/prisma-ilike-search.service.js';
import { SearchHandler } from './queries/search.query.js';
import { GlobalSearchHandler } from './queries/global-search.query.js';
import { SearchController } from './controllers/search.controller.js';

// Module 15 — Global Search unification (task #339). `GlobalSearchHandler`
// composes `SearchBugBountyHandler` (registered in BugBountyModule) via
// `QueryBus.execute()` — no `BugBountyModule` import needed here; CQRS's
// explorer discovers `@QueryHandler`-decorated providers app-wide at
// bootstrap regardless of which module registers them, the same "no
// module import for cross-module bus calls" pattern
// AutomationEngineModule already relies on for `ExecuteIntegrationActionCommand`.
@Module({
  imports: [WorkspacesModule],
  controllers: [SearchController],
  providers: [
    { provide: SEARCH_SERVICE, useClass: PrismaIlikeSearchService },
    SearchHandler,
    GlobalSearchHandler,
  ],
})
export class SearchModule {}
