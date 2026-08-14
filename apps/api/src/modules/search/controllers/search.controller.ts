import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { QueryBus } from '@nestjs/cqrs';
import type { GlobalSearchResultDto, SearchResultDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { SearchQuery } from '../queries/search.query.js';
import { GlobalSearchQuery } from '../queries/global-search.query.js';

@ApiTags('search')
@ApiBearerAuth()
@Controller('search')
export class SearchController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @ApiOperation({
    summary: 'Search projects/targets/notes/evidence in the workspace',
  })
  search(
    @Query('q') q: string = '',
    @CurrentUser() user: RequestUser,
  ): Promise<SearchResultDto[]> {
    return this.queryBus.execute(new SearchQuery(user.id, q));
  }

  // Module 15 — Global Search unification (task #339). Merges this
  // endpoint's own results with `/bugbounty/search`'s and adds PLUGIN/
  // WORKFLOW/SECURITY_ADVISORY coverage neither endpoint had. Additive —
  // `/search` and `/bugbounty/search` are untouched and remain the
  // endpoints existing web/mobile clients call; see GlobalSearchHandler's
  // doc comment for the disclosed frontend-migration follow-up.
  @Get('global')
  @ApiOperation({
    summary:
      'Search everything the caller can see in one call: projects/targets/notes/evidence, bug bounty programs/findings/reports/payloads/knowledge-base/AI chats/tags/tasks, plugins, workflows, and security advisories',
  })
  searchGlobal(
    @Query('q') q: string = '',
    @CurrentUser() user: RequestUser,
  ): Promise<GlobalSearchResultDto[]> {
    return this.queryBus.execute(new GlobalSearchQuery(user.id, q));
  }
}
