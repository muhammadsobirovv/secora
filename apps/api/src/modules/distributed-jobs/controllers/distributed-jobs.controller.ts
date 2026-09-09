import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { DistributedJobDto, JobEventDto, QueueMetricsDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { EnqueueDistributedJobDto, ListDistributedJobsQueryParamsDto } from '../dto/distributed-jobs.dto.js';
import { CancelDistributedJobCommand, EnqueueDistributedJobCommand } from '../commands/distributed-jobs.commands.js';
import {
  GetDistributedJobQuery,
  GetQueueMetricsQuery,
  ListDistributedJobsQuery,
  ListJobEventsQuery,
} from '../queries/distributed-jobs.query.js';

/// Human/org-facing distributed-queue surface — enqueue work, watch its
/// status/event trail, cancel it, and read fleet-wide queue metrics
/// (Metrics: queue depth by status/priority, worker capacity/load,
/// average wait time — the "Metrics" line item of the spec). The
/// machine-facing claim/complete/fail routes live in
/// `worker-jobs.controller.ts` instead (different auth: X-API-Key, no
/// organizationId in the path).
@ApiTags('distributed-jobs')
@ApiBearerAuth()
@Controller('enterprise/organizations/:organizationId/distributed-jobs')
export class DistributedJobsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List distributed jobs' })
  list(
    @Param('organizationId') organizationId: string,
    @Query() query: ListDistributedJobsQueryParamsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<DistributedJobDto[]> {
    return this.queryBus.execute(new ListDistributedJobsQuery(user.id, organizationId, query));
  }

  @Post()
  @ApiOperation({ summary: 'Enqueue a distributed job' })
  enqueue(
    @Param('organizationId') organizationId: string,
    @Body() dto: EnqueueDistributedJobDto,
    @CurrentUser() user: RequestUser,
  ): Promise<DistributedJobDto> {
    return this.commandBus.execute(new EnqueueDistributedJobCommand(user.id, organizationId, dto));
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Queue depth, worker capacity/load, and average wait time' })
  metrics(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<QueueMetricsDto> {
    return this.queryBus.execute(new GetQueueMetricsQuery(user.id, organizationId));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a distributed job' })
  get(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<DistributedJobDto> {
    return this.queryBus.execute(new GetDistributedJobQuery(user.id, organizationId, id));
  }

  @Get(':id/events')
  @ApiOperation({ summary: "List a job's lifecycle events (queued/assigned/started/retried/migrated/...)" })
  events(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<JobEventDto[]> {
    return this.queryBus.execute(new ListJobEventsQuery(user.id, organizationId, id));
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a queued/assigned/running job' })
  cancel(
    @Param('organizationId') organizationId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<DistributedJobDto> {
    return this.commandBus.execute(new CancelDistributedJobCommand(user.id, organizationId, id));
  }
}
