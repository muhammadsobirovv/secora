import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type {
  KnowledgeBaseReferenceEntryDto,
  KnowledgeBaseReferenceSearchResultDto,
} from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { CacheResponse } from '../../../common/decorators/cache-response.decorator.js';
import { CacheResponseInterceptor } from '../../../common/interceptors/cache-response.interceptor.js';
import { UpsertKnowledgeBaseReferenceDto } from '../dto/upsert-knowledge-base-reference.dto.js';
import {
  ListKnowledgeBaseReferencesQueryParamsDto,
  SearchKnowledgeBaseReferencesQueryParamsDto,
} from '../dto/list-knowledge-base-references-query.dto.js';
import { ListKnowledgeBaseReferencesQuery } from '../queries/list-knowledge-base-references.query.js';
import { SearchKnowledgeBaseReferencesQuery } from '../queries/search-knowledge-base-references.query.js';
import { GetKnowledgeBaseReferenceQuery } from '../queries/get-knowledge-base-reference.query.js';
import { UpsertKnowledgeBaseReferenceCommand } from '../commands/upsert-knowledge-base-reference.command.js';
import { DeleteKnowledgeBaseReferenceCommand } from '../commands/delete-knowledge-base-reference.command.js';
import { ReindexKnowledgeBaseReferencesCommand } from '../commands/reindex-knowledge-base-references.command.js';

/// Module 11 — Controllers + Swagger + module wiring + events (task #236).
/// The AI Knowledge Base's (task #227) first HTTP surface — the
/// OWASP/CWE/CAPEC/MITRE ATT&CK/NIST/CVE catalog was previously only
/// reachable via an agent's internal tool call, with zero way for a human
/// (or the frontend Copilot UI, task #237) to browse/search/curate it
/// directly.
@ApiTags('agent')
@ApiBearerAuth()
@Controller('knowledge-base/references')
// Module 14 — API Gateway: this catalog (OWASP/CWE/CAPEC/MITRE/NIST/CVE
// reference data) is curated content, not per-user or per-workspace
// state — it changes only via explicit `upsert`/`delete` calls, so
// short-TTL caching on the read routes below is cheap and low-risk.
// `CacheService` has no pattern-delete, only get/set/delete-by-exact-key,
// so `upsert`/`delete` do not attempt to invalidate matching cache
// entries — a curator's edit can take up to the 5-minute TTL to become
// visible on `list`/`get`. Acceptable for a reference catalog; routes
// with a lower staleness tolerance should use a shorter TTL rather than
// rely on invalidation this interceptor doesn't provide. See
// `CacheResponseInterceptor` for why this is opt-in per-route rather
// than global.
@UseInterceptors(CacheResponseInterceptor)
export class KnowledgeBaseReferencesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @CacheResponse(300)
  @ApiOperation({ summary: 'List the AI Knowledge Base reference catalog' })
  list(
    @Query() query: ListKnowledgeBaseReferencesQueryParamsDto,
  ): Promise<KnowledgeBaseReferenceEntryDto[]> {
    return this.queryBus.execute(new ListKnowledgeBaseReferencesQuery(query));
  }

  @Get('search')
  @ApiOperation({ summary: 'Relevance-ranked search over the reference catalog' })
  search(
    @Query() query: SearchKnowledgeBaseReferencesQueryParamsDto,
  ): Promise<KnowledgeBaseReferenceSearchResultDto[]> {
    return this.queryBus.execute(new SearchKnowledgeBaseReferencesQuery(query));
  }

  @Get(':id')
  @CacheResponse(300)
  @ApiOperation({ summary: 'Get one reference catalog entry' })
  get(@Param('id') id: string): Promise<KnowledgeBaseReferenceEntryDto> {
    return this.queryBus.execute(new GetKnowledgeBaseReferenceQuery(id));
  }

  @Post()
  @ApiOperation({ summary: 'Upsert a reference catalog entry (curation)' })
  upsert(@Body() dto: UpsertKnowledgeBaseReferenceDto): Promise<KnowledgeBaseReferenceEntryDto> {
    return this.commandBus.execute(new UpsertKnowledgeBaseReferenceCommand(dto));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a reference catalog entry' })
  delete(@Param('id') id: string): Promise<void> {
    return this.commandBus.execute(new DeleteKnowledgeBaseReferenceCommand(id));
  }

  @Put('reindex')
  @ApiOperation({
    summary: "Opt-in: fold the whole catalog into this workspace's semantic RAG store",
  })
  reindex(@CurrentUser() user: RequestUser): Promise<{ indexed: number }> {
    return this.commandBus.execute(new ReindexKnowledgeBaseReferencesCommand(user.id));
  }
}
