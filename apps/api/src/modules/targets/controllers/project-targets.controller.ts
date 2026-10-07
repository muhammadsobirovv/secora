import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { Request } from 'express';
import type { TargetDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { extractRequestContext } from '../../../common/utils/request-context.js';
import { CreateTargetDto } from '../dto/create-target.dto.js';
import { ListTargetsQueryParamsDto } from '../dto/list-targets-query.dto.js';
import { CreateTargetCommand } from '../commands/create-target.command.js';
import { ListTargetsQuery } from '../queries/target.queries.js';

@ApiTags('targets')
@ApiBearerAuth()
@Controller('projects/:projectId/targets')
export class ProjectTargetsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List targets in a project' })
  list(
    @Param('projectId') projectId: string,
    @Query() filter: ListTargetsQueryParamsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<TargetDto[]> {
    return this.queryBus.execute(
      new ListTargetsQuery(user.id, projectId, filter),
    );
  }

  @Post()
  @ApiOperation({ summary: 'Create a target in a project' })
  create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateTargetDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ): Promise<TargetDto> {
    return this.commandBus.execute(
      new CreateTargetCommand(
        user.id,
        projectId,
        dto,
        extractRequestContext(req),
      ),
    );
  }
}
