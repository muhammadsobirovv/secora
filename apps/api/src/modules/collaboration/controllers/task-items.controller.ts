import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { TaskItemDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { CreateTaskItemDto, ListTaskItemsQueryParamsDto, UpdateTaskItemDto } from '../dto/collaboration.dto.js';
import {
  CreateTaskItemCommand,
  DeleteTaskItemCommand,
  UpdateTaskItemCommand,
} from '../commands/task-items.commands.js';
import { ListTaskItemsQuery } from '../queries/task-items.query.js';

@ApiTags('collaboration')
@ApiBearerAuth()
@Controller('collaboration/workspaces/:workspaceId/tasks')
export class TaskItemsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List task list items' })
  list(
    @Param('workspaceId') workspaceId: string,
    @Query() query: ListTaskItemsQueryParamsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<TaskItemDto[]> {
    return this.queryBus.execute(new ListTaskItemsQuery(user.id, workspaceId, query));
  }

  @Post()
  @ApiOperation({ summary: 'Create a task list item' })
  create(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateTaskItemDto,
    @CurrentUser() user: RequestUser,
  ): Promise<TaskItemDto> {
    return this.commandBus.execute(new CreateTaskItemCommand(user.id, workspaceId, dto));
  }

  @Patch(':taskId')
  @ApiOperation({ summary: 'Update/complete a task list item' })
  update(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTaskItemDto,
    @CurrentUser() user: RequestUser,
  ): Promise<TaskItemDto> {
    return this.commandBus.execute(new UpdateTaskItemCommand(user.id, workspaceId, taskId, dto));
  }

  @Delete(':taskId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a task list item' })
  async remove(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.commandBus.execute(new DeleteTaskItemCommand(user.id, workspaceId, taskId));
  }
}
