import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { SearchAiMemoryQueryParamsDto } from '../dto/search-ai-memory-query.dto.js';
import { SearchAiMemoryQuery } from '../queries/search-ai-memory.query.js';
import { ReindexAiMemoryCommand } from '../commands/reindex-ai-memory.command.js';
import type { AiMemorySearchResult } from '../domain/repositories/ai-memory.repository.interface.js';

@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai/memory')
export class AiMemoryController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get('search')
  @ApiOperation({
    summary:
      "Semantic search over this workspace/project's indexed memory (RAG)",
  })
  search(
    @Query() query: SearchAiMemoryQueryParamsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<AiMemorySearchResult[]> {
    return this.queryBus.execute(
      new SearchAiMemoryQuery(
        user.id,
        query.q,
        query.projectId,
        query.sourceType,
      ),
    );
  }

  @Post(':projectId/reindex')
  @ApiOperation({
    summary:
      'Rebuild the RAG index for a project (findings, recon results, notes)',
  })
  reindex(
    @Param('projectId') projectId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<{ indexed: number }> {
    return this.commandBus.execute(
      new ReindexAiMemoryCommand(user.id, projectId),
    );
  }
}
