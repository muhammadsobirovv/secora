import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { Request } from 'express';
import type { VulnScanJobDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { extractRequestContext } from '../../../common/utils/request-context.js';
import { CreateVulnScanJobDto } from '../dto/create-vuln-scan-job.dto.js';
import { CreateVulnScanJobCommand } from '../commands/create-vuln-scan-job.command.js';
import { ListVulnScanJobsQuery } from '../queries/list-vuln-scan-jobs.query.js';

/// Nested under a target — "Start Scan" only ever makes sense in the
/// context of one target, and listing here is the target detail page's
/// vulnerability scan history card. Single-job routes live on the flat
/// VulnScanJobsController (job ids are globally unique UUIDs), same
/// convention as Module 3's TargetReconJobsController.
@ApiTags('vuln')
@ApiBearerAuth()
@Controller('targets/:targetId/vuln/jobs')
export class TargetVulnScanJobsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Start a vulnerability scan against a target' })
  create(
    @Param('targetId') targetId: string,
    @Body() dto: CreateVulnScanJobDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ): Promise<VulnScanJobDto> {
    return this.commandBus.execute(
      new CreateVulnScanJobCommand(
        user.id,
        targetId,
        dto,
        extractRequestContext(req),
      ),
    );
  }

  @Get()
  @ApiOperation({ summary: "List a target's vulnerability scan jobs" })
  list(
    @Param('targetId') targetId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<VulnScanJobDto[]> {
    return this.queryBus.execute(
      new ListVulnScanJobsQuery(user.id, { targetId }),
    );
  }
}
