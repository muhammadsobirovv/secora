import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type {
  PromptTemplateDto,
  PromptTemplateExportDto,
  PromptTemplateVersionDto,
  PromptTestRunDto,
} from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { CreatePromptTemplateDto } from '../dto/create-prompt-template.dto.js';
import { UpdatePromptTemplateDto } from '../dto/update-prompt-template.dto.js';
import { ListPromptTemplatesQueryParamsDto } from '../dto/list-prompt-templates-query.dto.js';
import {
  CreatePromptTemplateVersionDto,
  ImportPromptTemplatesDto,
  RatePromptTestRunDto,
  RunPromptTestDto,
} from '../dto/prompt-registry.dto.js';
import { CreatePromptTemplateCommand } from '../commands/create-prompt-template.command.js';
import { UpdatePromptTemplateCommand } from '../commands/update-prompt-template.command.js';
import { DeletePromptTemplateCommand } from '../commands/delete-prompt-template.command.js';
import { ListPromptTemplatesQuery } from '../queries/list-prompt-templates.query.js';
import {
  CreatePromptTemplateVersionCommand,
  ImportPromptTemplatesCommand,
  RatePromptTestRunCommand,
  RunPromptTestCommand,
} from '../commands/prompt-registry.commands.js';
import {
  ExportPromptTemplatesQuery,
  ListPromptTemplateVersionsQuery,
  ListPromptTestRunsQuery,
} from '../queries/prompt-registry.queries.js';

/// AI Chat's Prompt Library / Conversation Templates (task #230) —
/// workspace-scoped, shared with teammates the same way KnowledgeBaseNote
/// is (see PromptTemplate's schema.prisma doc comment).
@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai/prompt-templates')
export class PromptTemplatesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List saved prompt templates' })
  list(
    @Query() query: ListPromptTemplatesQueryParamsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<PromptTemplateDto[]> {
    return this.queryBus.execute(new ListPromptTemplatesQuery(user.id, query));
  }

  @Post()
  @ApiOperation({ summary: 'Save a new prompt template' })
  create(
    @Body() dto: CreatePromptTemplateDto,
    @CurrentUser() user: RequestUser,
  ): Promise<PromptTemplateDto> {
    return this.commandBus.execute(new CreatePromptTemplateCommand(user.id, dto));
  }

  @Put(':templateId')
  @ApiOperation({ summary: 'Update a prompt template' })
  update(
    @Param('templateId') templateId: string,
    @Body() dto: UpdatePromptTemplateDto,
    @CurrentUser() user: RequestUser,
  ): Promise<PromptTemplateDto> {
    return this.commandBus.execute(
      new UpdatePromptTemplateCommand(user.id, templateId, dto),
    );
  }

  @Delete(':templateId')
  @ApiOperation({ summary: 'Delete a prompt template' })
  delete(
    @Param('templateId') templateId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    return this.commandBus.execute(
      new DeletePromptTemplateCommand(user.id, templateId),
    );
  }

  // ---- Module 13 — Prompt Registry (task #280) ----

  @Get('export')
  @ApiOperation({ summary: 'Export all of a workspace\'s prompt templates as a portable bundle' })
  export(@CurrentUser() user: RequestUser): Promise<PromptTemplateExportDto[]> {
    return this.queryBus.execute(new ExportPromptTemplatesQuery(user.id));
  }

  @Post('import')
  @ApiOperation({ summary: 'Import a portable bundle of prompt templates' })
  import(
    @Body() dto: ImportPromptTemplatesDto,
    @CurrentUser() user: RequestUser,
  ): Promise<PromptTemplateDto[]> {
    return this.commandBus.execute(new ImportPromptTemplatesCommand(user.id, dto));
  }

  @Get(':templateId/versions')
  @ApiOperation({ summary: 'List a prompt template\'s saved versions' })
  listVersions(
    @Param('templateId') templateId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<PromptTemplateVersionDto[]> {
    return this.queryBus.execute(new ListPromptTemplateVersionsQuery(user.id, templateId));
  }

  @Post(':templateId/versions')
  @ApiOperation({ summary: 'Save a new version of a prompt template' })
  createVersion(
    @Param('templateId') templateId: string,
    @Body() dto: CreatePromptTemplateVersionDto,
    @CurrentUser() user: RequestUser,
  ): Promise<PromptTemplateVersionDto> {
    return this.commandBus.execute(new CreatePromptTemplateVersionCommand(user.id, templateId, dto));
  }

  @Post(':templateId/test')
  @ApiOperation({ summary: 'Run a prompt template (or a specific saved version) against an AI provider' })
  runTest(
    @Param('templateId') templateId: string,
    @Body() dto: RunPromptTestDto,
    @CurrentUser() user: RequestUser,
  ): Promise<PromptTestRunDto> {
    return this.commandBus.execute(new RunPromptTestCommand(user.id, templateId, dto));
  }

  @Get(':templateId/test-runs')
  @ApiOperation({ summary: 'List a prompt template\'s past test runs (Prompt History)' })
  listTestRuns(
    @Param('templateId') templateId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<PromptTestRunDto[]> {
    return this.queryBus.execute(new ListPromptTestRunsQuery(user.id, templateId));
  }

  @Put(':templateId/test-runs/:runId/rating')
  @ApiOperation({ summary: 'Rate a past test run' })
  rateTestRun(
    @Param('templateId') templateId: string,
    @Param('runId') runId: string,
    @Body() dto: RatePromptTestRunDto,
    @CurrentUser() user: RequestUser,
  ): Promise<{ rated: true }> {
    return this.commandBus.execute(new RatePromptTestRunCommand(user.id, templateId, runId, dto));
  }
}
