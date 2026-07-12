import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { ReconFindingDto, TargetDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { PromoteFindingDto } from '../dto/promote-finding.dto.js';
import { PromoteFindingToTargetCommand } from '../commands/promote-finding-to-target.command.js';
import { GetReconFindingQuery } from '../queries/get-recon-finding.query.js';

@ApiTags('recon')
@ApiBearerAuth()
@Controller('recon/findings')
export class ReconFindingsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get(':findingId')
  @ApiOperation({ summary: 'Get a recon finding' })
  get(
    @Param('findingId') findingId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ReconFindingDto> {
    return this.queryBus.execute(new GetReconFindingQuery(user.id, findingId));
  }

  @Post(':findingId/promote')
  @ApiOperation({ summary: 'Promote a finding to a real target' })
  promote(
    @Param('findingId') findingId: string,
    @Body() dto: PromoteFindingDto,
    @CurrentUser() user: RequestUser,
  ): Promise<TargetDto> {
    return this.commandBus.execute(
      new PromoteFindingToTargetCommand(user.id, findingId, dto),
    );
  }
}
