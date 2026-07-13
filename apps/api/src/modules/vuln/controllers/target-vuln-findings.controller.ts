import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { QueryBus } from '@nestjs/cqrs';
import type { VulnFindingDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { ListVulnFindingsQuery } from '../queries/list-vuln-findings.query.js';

@ApiTags('vuln')
@ApiBearerAuth()
@Controller('targets/:targetId/vuln/findings')
export class TargetVulnFindingsController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @ApiOperation({ summary: "List a target's vulnerability findings" })
  list(
    @Param('targetId') targetId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<VulnFindingDto[]> {
    return this.queryBus.execute(
      new ListVulnFindingsQuery(user.id, { targetId }),
    );
  }
}
