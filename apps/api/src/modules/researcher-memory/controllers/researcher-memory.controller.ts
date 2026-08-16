import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { ResearcherMemoryEntryDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import {
  CreateResearcherMemoryEntryDto,
  ListResearcherMemoryEntriesQueryParamsDto,
  UpdateResearcherMemoryEntryDto,
} from '../dto/researcher-memory.dto.js';
import {
  CreateResearcherMemoryEntryCommand,
  DeleteResearcherMemoryEntryCommand,
  UpdateResearcherMemoryEntryCommand,
} from '../commands/researcher-memory.commands.js';
import {
  ExportResearcherMemoryEntriesQuery,
  GetResearcherMemoryEntryQuery,
  ListResearcherMemoryEntriesQuery,
} from '../queries/researcher-memory.query.js';

/// Module 16 — AI Memory / researcher memory (task #397). Matches
/// `RESEARCHER_MEMORY_ENDPOINTS` in packages/shared exactly. No
/// `:workspaceId` in the path — see researcher-memory-workspace.util.ts
/// for why (same posture as ResearchSessionController).
@ApiTags('ai-memory')
@ApiBearerAuth()
@Controller('ai/memory')
export class ResearcherMemoryController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List your researcher memory entries (optionally filtered/searched)' })
  list(
    @Query() query: ListResearcherMemoryEntriesQueryParamsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ResearcherMemoryEntryDto[]> {
    return this.queryBus.execute(
      new ListResearcherMemoryEntriesQuery(user.id, { kind: query.kind, search: query.search }),
    );
  }

  @Get('export')
  @ApiOperation({ summary: 'Export every researcher memory entry you own as JSON' })
  export(@CurrentUser() user: RequestUser): Promise<ResearcherMemoryEntryDto[]> {
    return this.queryBus.execute(new ExportResearcherMemoryEntriesQuery(user.id));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one researcher memory entry' })
  get(@Param('id') id: string, @CurrentUser() user: RequestUser): Promise<ResearcherMemoryEntryDto> {
    return this.queryBus.execute(new GetResearcherMemoryEntryQuery(user.id, id));
  }

  @Post()
  @ApiOperation({ summary: 'Save a researcher memory entry (preference/context/note/finding/decision/instruction)' })
  create(
    @Body() dto: CreateResearcherMemoryEntryDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ResearcherMemoryEntryDto> {
    return this.commandBus.execute(new CreateResearcherMemoryEntryCommand(user.id, dto));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a researcher memory entry you own' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateResearcherMemoryEntryDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ResearcherMemoryEntryDto> {
    return this.commandBus.execute(new UpdateResearcherMemoryEntryCommand(user.id, id, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Explicitly delete a researcher memory entry (also removes it from RAG search)' })
  async remove(@Param('id') id: string, @CurrentUser() user: RequestUser): Promise<void> {
    await this.commandBus.execute(new DeleteResearcherMemoryEntryCommand(user.id, id));
  }
}
