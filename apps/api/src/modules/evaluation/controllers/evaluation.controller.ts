import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { EvaluationRunDto, EvaluationSummaryDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { ListEvaluationRunsQueryParamsDto, RunEvaluationDto } from '../dto/evaluation.dto.js';
import { RunEvaluationCommand } from '../commands/evaluation.commands.js';
import { GetEvaluationSummaryQuery, ListEvaluationRunsQuery } from '../queries/evaluation.queries.js';

/// Module 13 — AI Evaluation (task #289). Workspace-scoped, same
/// personal-workspace resolution every other Module 13 controller uses.
@ApiTags('evaluation')
@ApiBearerAuth()
@Controller('evaluation')
export class EvaluationController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post('runs')
  @ApiOperation({ summary: 'Run one of the seven AI evaluation metrics and persist the result' })
  run(@Body() dto: RunEvaluationDto, @CurrentUser() user: RequestUser): Promise<EvaluationRunDto> {
    return this.commandBus.execute(new RunEvaluationCommand(user.id, dto));
  }

  @Get('runs')
  @ApiOperation({ summary: 'List past evaluation runs' })
  list(@Query() query: ListEvaluationRunsQueryParamsDto, @CurrentUser() user: RequestUser): Promise<EvaluationRunDto[]> {
    return this.queryBus.execute(new ListEvaluationRunsQuery(user.id, query));
  }

  @Get('summary')
  @ApiOperation({ summary: 'Per-metric sample count / average score / latest score' })
  summary(@CurrentUser() user: RequestUser): Promise<EvaluationSummaryDto[]> {
    return this.queryBus.execute(new GetEvaluationSummaryQuery(user.id));
  }
}
