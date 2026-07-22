import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { QueryBus } from '@nestjs/cqrs';
import type { BugBountySearchResultDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { SearchBugBountyQueryParamsDto } from '../dto/search.dto.js';
import { SearchBugBountyQuery } from '../queries/search-bugbounty.query.js';

@ApiTags('bugbounty')
@ApiBearerAuth()
@Controller('bugbounty/search')
export class BugBountySearchController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @ApiOperation({
    summary:
      'Global search across programs/findings/reports/payloads/knowledge base notes',
  })
  search(
    @Query() query: SearchBugBountyQueryParamsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<BugBountySearchResultDto[]> {
    return this.queryBus.execute(new SearchBugBountyQuery(user.id, query.q));
  }
}
