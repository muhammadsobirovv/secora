import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { Request } from 'express';
import type { ReconJobDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { extractRequestContext } from '../../../common/utils/request-context.js';
import { CreateReconJobDto } from '../dto/create-recon-job.dto.js';
import { CreateReconJobCommand } from '../commands/create-recon-job.command.js';
import { ListReconJobsQuery } from '../queries/list-recon-jobs.query.js';

/// Nested under a target — creating a scan only ever makes sense in the
/// context of one target, and listing here is the target detail page's
/// "recon" card. Single-job routes (get/cancel/retry/logs/findings) live
/// on the flat ReconJobsController, since job ids are globally unique
/// UUIDs (same convention as TargetsController).
@ApiTags('recon')
@ApiBearerAuth()
@Controller('targets/:targetId/recon/jobs')
export class TargetReconJobsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Start a recon scan against a target' })
  create(
    @Param('targetId') targetId: string,
    @Body() dto: CreateReconJobDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ): Promise<ReconJobDto> {
    return this.commandBus.execute(
      new CreateReconJobCommand(
        user.id,
        targetId,
        dto,
        extractRequestContext(req),
      ),
    );
  }

  @Get()
  @ApiOperation({ summary: "List a target's recon jobs" })
  list(
    @Param('targetId') targetId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ReconJobDto[]> {
    return this.queryBus.execute(new ListReconJobsQuery(user.id, { targetId }));
  }
}
