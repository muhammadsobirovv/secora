import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { QueryBus } from '@nestjs/cqrs';
import type { ReconFindingDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { ListReconFindingsQuery } from '../queries/list-recon-findings.query.js';

@ApiTags('recon')
@ApiBearerAuth()
@Controller('targets/:targetId/recon/findings')
export class TargetReconFindingsController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @ApiOperation({ summary: "List a target's recon findings" })
  list(
    @Param('targetId') targetId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ReconFindingDto[]> {
    return this.queryBus.execute(
      new ListReconFindingsQuery(user.id, { targetId }),
    );
  }
}
