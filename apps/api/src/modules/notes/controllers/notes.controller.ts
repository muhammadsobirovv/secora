import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { NoteDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { UpdateNoteDto } from '../dto/update-note.dto.js';
import {
  UpdateNoteCommand,
  DeleteNoteCommand,
} from '../commands/note-lifecycle.commands.js';
import { GetNoteQuery } from '../queries/note.queries.js';

@ApiTags('notes')
@ApiBearerAuth()
@Controller('notes')
export class NotesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get(':noteId')
  @ApiOperation({ summary: 'Get a note' })
  get(
    @Param('noteId') noteId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<NoteDto> {
    return this.queryBus.execute(new GetNoteQuery(user.id, noteId));
  }

  @Patch(':noteId')
  @ApiOperation({ summary: 'Update a note (also used for auto-save)' })
  update(
    @Param('noteId') noteId: string,
    @Body() dto: UpdateNoteDto,
    @CurrentUser() user: RequestUser,
  ): Promise<NoteDto> {
    return this.commandBus.execute(new UpdateNoteCommand(user.id, noteId, dto));
  }

  @Delete(':noteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a note' })
  delete(
    @Param('noteId') noteId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    return this.commandBus.execute(new DeleteNoteCommand(user.id, noteId));
  }
}
