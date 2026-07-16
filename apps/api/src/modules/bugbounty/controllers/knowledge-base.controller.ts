import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { KnowledgeBaseNoteDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import {
  CreateKnowledgeBaseNoteDto,
  ListKnowledgeBaseNotesQueryParamsDto,
  UpdateKnowledgeBaseNoteDto,
} from '../dto/knowledge-base.dto.js';
import {
  CreateKnowledgeBaseNoteCommand,
  DeleteKnowledgeBaseNoteCommand,
  UpdateKnowledgeBaseNoteCommand,
} from '../commands/knowledge-base.commands.js';
import {
  GetKnowledgeBaseNoteQuery,
  ListKnowledgeBaseNotesQuery,
} from '../queries/knowledge-base.queries.js';

@ApiTags('bugbounty')
@ApiBearerAuth()
@Controller('bugbounty/knowledge-base')
export class KnowledgeBaseController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List personal knowledge base notes' })
  list(
    @Query() query: ListKnowledgeBaseNotesQueryParamsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<KnowledgeBaseNoteDto[]> {
    return this.queryBus.execute(
      new ListKnowledgeBaseNotesQuery(user.id, query),
    );
  }

  @Post()
  @ApiOperation({ summary: 'Create a knowledge base note' })
  create(
    @Body() dto: CreateKnowledgeBaseNoteDto,
    @CurrentUser() user: RequestUser,
  ): Promise<KnowledgeBaseNoteDto> {
    return this.commandBus.execute(
      new CreateKnowledgeBaseNoteCommand(user.id, dto),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a knowledge base note' })
  get(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<KnowledgeBaseNoteDto> {
    return this.queryBus.execute(new GetKnowledgeBaseNoteQuery(user.id, id));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a knowledge base note' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateKnowledgeBaseNoteDto,
    @CurrentUser() user: RequestUser,
  ): Promise<KnowledgeBaseNoteDto> {
    return this.commandBus.execute(
      new UpdateKnowledgeBaseNoteCommand(user.id, id, dto),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a knowledge base note' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.commandBus.execute