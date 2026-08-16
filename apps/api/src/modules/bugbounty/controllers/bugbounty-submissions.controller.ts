import { Body, Controller, Get, Param, Post, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { SubmissionAnalyticsDto, SubmissionDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import {
  CreateSubmissionDto,
  ListSubmissionsQueryParamsDto,
  UpdateSubmissionStatusDto,
} from '../dto/submission.dto.js';
import {
  CreateSubmissionCommand,
  UpdateSubmissionStatusCommand,
} from '../commands/submission-lifecycle.commands.js';
import {
  GetSubmissionQuery,
  ListSubmissionsQuery,
} from '../queries/submission.queries.js';
import { GetRewardAnalyticsQuery } from '../queries/get-reward-analytics.query.js';

/// Module 16 — Bug Bounty Submissions + Rewards (task #385). Routes match
/// SUBMISSION_ENDPOINTS in @pentesthub/shared/module16-endpoints.ts:
/// GET/POST bug-bounty/submissions, GET bug-bounty/submissions/:id, GET
/// bug-bounty/rewards. `rewards` is declared before `:id` so it isn't
/// swallowed by the parameterized route (same reasoning as
/// BugBountyFindingsController's `duplicate-check`).
@ApiTags('bugbounty')
@ApiBearerAuth()
@Controller('bug-bounty')
export class BugBountySubmissionsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get('submissions')
  @ApiOperation({ summary: 'List bug bounty submissions' })
  list(
    @Query() query: ListSubmissionsQueryParamsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<SubmissionDto[]> {
    return this.queryBus.execute(new ListSubmissionsQuery(user.id, query));
  }

  @Post('submissions')
  @ApiOperation({ summary: 'Create a bug bounty submission for a finding' })
  create(
    @Body() dto: CreateSubmissionDto,
    @CurrentUser() user: RequestUser,
  ): Promise<SubmissionDto> {
    return this.commandBus.execute(new CreateSubmissionCommand(user.id, dto));
  }

  @Get('rewards')
  @ApiOperation({ summary: 'Reward totals + submission analytics for this workspace' })
  rewards(@CurrentUser() user: RequestUser): Promise<SubmissionAnalyticsDto> {
    return this.queryBus.execute(new GetRewardAnalyticsQuery(user.id));
  }

  @Get('submissions/:id')
  @ApiOperation({ summary: 'Get a bug bounty submission' })
  get(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<SubmissionDto> {
    return this.queryBus.execute(new GetSubmissionQuery(user.id, id));
  }

  @Patch('submissions/:id/status')
  @ApiOperation({ summary: 'Transition a submission’s status (and record a reward, if applicable)' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateSubmissionStatusDto,
    @CurrentUser() user: RequestUser,
  ): Promise<SubmissionDto> {
    return this.commandBus.execute(
      new UpdateSubmissionStatusCommand(user.id, id, dto),
    );
  }
}
