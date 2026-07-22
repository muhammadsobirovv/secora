import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { AssignmentDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { CreateAssignmentDto, ListAssignmentsQueryParamsDto, UpdateAssignmentDto } from '../dto/collaboration.dto.js';
import {
  CreateAssignmentCommand,
  DeleteAssignmentCommand,
  UpdateAssignmentCommand,
} from '../commands/assignments.commands.js';
import { ListAssignmentsQuery } from '../queries/assignments.query.js';

@ApiTags('collaboration')
@ApiBearerAuth()
@Controller('collaboration/workspaces/:workspaceId/assignments')
export class AssignmentsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List assignments (filterable by entity/assignee/status)' })
  list(
    @Param('workspaceId') workspaceId: string,
    @Query() query: ListAssignmentsQueryParamsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<AssignmentDto[]> {
    return this.queryBus.execute(new ListAssignmentsQuery(user.id, workspaceId, query));
  }

  @Post()
  @ApiOperation({ summary: 'Assign a Program/Finding/Report/Target/Task to a workspace member' })
  create(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateAssignmentDto,
    @CurrentUser() user: RequestUser,
  ): Promise<AssignmentDto> {
    return this.commandBus.execute(new CreateAssignmentCommand(user.id, workspaceId, dto));
  }

  @Patch(':assignmentId')
  @ApiOperation({ summary: 'Update assignment status/due date' })
  update(
    @Param('workspaceId') workspaceId: string,
    @Param('assignmentId') assignmentId: string,
    @Body() dto: UpdateAssignmentDto,
    @CurrentUser() user: RequestUser,
  ): Promise<AssignmentDto> {
    return this.commandBus.execute(new UpdateAssignmentCommand(user.id, workspaceId, assignmentId, dto));
  }

  @Delete(':assignmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove an assignment (Triager+)' })
  async remove(
    @Param('workspaceId') workspaceId: string,
    @Param('assignmentId') assignmentId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.commandBus.execute(new DeleteAssignmentCommand(user.id, workspaceId, assignmentId));
  }
}
