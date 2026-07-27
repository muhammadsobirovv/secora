import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { PromptTemplateDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { CreatePromptTemplateDto } from '../dto/create-prompt-template.dto.js';
import { UpdatePromptTemplateDto } from '../dto/update-prompt-template.dto.js';
import { ListPromptTemplatesQueryParamsDto } from '../dto/list-prompt-templates-query.dto.js';
import { CreatePromptTemplateCommand } from '../commands/create-prompt-template.command.js';
import { UpdatePromptTemplateCommand } from '../commands/update-prompt-template.command.js';
import { DeletePromptTemplateCommand } from '../commands/delete-prompt-template.command.js';
import { ListPromptTemplatesQuery } from '../queries/list-prompt-templates.query.js';

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
}
