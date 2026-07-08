import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { NoteDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { CreateNoteDto } from '../dto/create-note.dto.js';
import { CreateNoteCommand } from '../commands/create-note.command.js';
import { ListNotesQuery } from '../queries/note.queries.js';

@ApiTags('notes')
@ApiBearerAuth()
@Controller('projects/:projectId/notes')
export class ProjectNotesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List notes in a project' })
  list(
    @Param('projectId') projectId: string,
    @Query('targetId') targetId: string | undefined,
    @CurrentUser() user: RequestUser,
  ): Promise<NoteDto[]> {
    return this.queryBus.execute(
      new ListNotesQuery(user.id, projectId, targetId),
    );
  }

  @Post()
  @ApiOperation({ summary: 'Create a note in a project' })
  create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateNoteDto,
    @CurrentUser() user: RequestUser,
  ): Promise<NoteDto> {
    return this.commandBus.execute(
      new CreateNoteCommand(user.id, projectId, dto),
    );
  }
}
