import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { QueryBus } from '@nestjs/cqrs';
import type { SearchResultDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { SearchQuery } from '../queries/search.query.js';

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
}
