import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { ScheduledJobDto, ScheduledJobRunDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { CreateScheduledJobDto, ListScheduledJobsQueryParamsDto, UpdateScheduledJobDto } from '../dto/scheduled-job.dto.js';
import {
  CreateScheduledJobCommand,
  DeleteScheduledJobCommand,
  RunScheduledJobNowCommand,
  UpdateScheduledJobCommand,
} from '../commands/scheduled-jobs.commands.js';
import { ListScheduledJobRunsQuery, ListScheduledJobsQuery } from '../queries/scheduled-jobs.query.js';

@ApiTags('automation')
@ApiBearerAuth()
@Controller('automation/workspaces/:workspaceId/scheduled-jobs')
export class ScheduledJobsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List scheduled jobs (Daily Recon, Weekly Nuclei, Scope Refresh, ...)' })
  list(
    @Param('workspaceId') workspaceId: string,
    @Query() query: ListScheduledJobsQueryParamsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ScheduledJobDto[]> {
    return this.queryBus.execute(new ListScheduledJobsQuery(user.id, workspaceId, query));
  }

  @Post()
  @ApiOperation({ summary: 'Create a scheduled job (Manager+)' })
  create(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateScheduledJobDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ScheduledJobDto> {
    return this.commandBus.execute(new CreateScheduledJobCommand(user.id, workspaceId, dto));
  }

  @Patch(':jobId')
  @ApiOperation({ summary: 'Update a scheduled job (Manager+)' })
  update(
    @Param('workspaceId') workspaceId: string,
    @Param('jobId') jobId: string,
    @Body() dto: UpdateScheduledJobDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ScheduledJobDto> {
    return this.commandBus.execute(new UpdateScheduledJobCommand(user.id, workspaceId, jobId, dto));
  }

  @Delete(':jobId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a scheduled job (Manager+)' })
  async remove(
    @Param('workspaceId') workspaceId: string,
    @Param('jobId') jobId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.commandBus.execute(new DeleteScheduledJobCommand(user.id, workspaceId, jobId));
  }

  @Get(':jobId/runs')
  @ApiOperation({ summary: 'List recent runs for a scheduled job' })
  listRuns(
    @Param('workspaceId') workspaceId: string,
    @Param('jobId') jobId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ScheduledJobRunDto[]> {
    return this.queryBus.execute(new ListScheduledJobRunsQuery(user.id, workspaceId, jobId));
  }

  @Post(':jobId/run-now')
  @ApiOperation({ summary: 'Run a scheduled job immediately (Manager+)' })
  runNow(
    @Param('workspaceId') workspaceId: string,
    @Param('jobId') jobId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<ScheduledJobRunDto> {
    return this.commandBus.execute(new RunScheduledJobNowCommand(user.id, workspaceId, jobId));
  }
}
