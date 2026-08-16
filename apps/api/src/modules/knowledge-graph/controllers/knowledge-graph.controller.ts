import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  KnowledgeGraphNodeDto,
  KnowledgeGraphNodeType,
  KnowledgeGraphPathStepDto,
  KnowledgeGraphRelationshipDto,
  KnowledgeGraphSearchResultDto,
} from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { KnowledgeGraphService } from '../knowledge-graph.service.js';
import { KnowledgeGraphPathQueryParamsDto, KnowledgeGraphSearchQueryParamsDto } from '../dto/knowledge-graph.dto.js';
import { ResearcherMemoryWorkspaceResolver } from '../../researcher-memory/researcher-memory-workspace.util.js';

/// Module 16 — Knowledge Graph query layer (task #391). Reuses
/// `ResearcherMemoryWorkspaceResolver` for "the caller's own workspace"
/// resolution rather than duplicating the same three lines a third time
/// (see its doc comment — the underlying pattern originates in
/// ResearchSessionController). No `:workspaceId` path param; see
/// KnowledgeGraphService's own doc comment for why every query is still
/// workspace-isolated regardless.
@ApiTags('knowledge-graph')
@ApiBearerAuth()
@Controller('knowledge-graph')
export class KnowledgeGraphController {
  constructor(
    private readonly graph: KnowledgeGraphService,
    private readonly workspaceResolver: ResearcherMemoryWorkspaceResolver,
  ) {}

  @Get('search')
  @ApiOperation({ summary: 'Search entities across the knowledge graph' })
  async search(
    @Query() query: KnowledgeGraphSearchQueryParamsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<KnowledgeGraphSearchResultDto[]> {
    const workspaceId = await this.workspaceResolver.resolve(user.id);
    return this.graph.search(workspaceId, query.query, query.types, query.limit ?? 25);
  }

  @Get('path')
  @ApiOperation({ summary: 'Find a bounded-depth path between two nodes' })
  async path(
    @Query() query: KnowledgeGraphPathQueryParamsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<KnowledgeGraphPathStepDto[] | null> {
    const workspaceId = await this.workspaceResolver.resolve(user.id);
    return this.graph.findPath(workspaceId, query.fromType, query.fromId, query.toType, query.toId, query.maxDepth);
  }

  @Get('nodes/:type/:id')
  @ApiOperation({ summary: 'Look up one node' })
  async getNode(
    @Param('type') type: KnowledgeGraphNodeType,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<KnowledgeGraphNodeDto> {
    const workspaceId = await this.workspaceResolver.resolve(user.id);
    return this.graph.getNode(workspaceId, type, id);
  }

  @Get('nodes/:type/:id/relationships')
  @ApiOperation({ summary: "List a node's direct relationships" })
  async getRelationships(
    @Param('type') type: KnowledgeGraphNodeType,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<KnowledgeGraphRelationshipDto[]> {
    const workspaceId = await this.workspaceResolver.resolve(user.id);
    return this.graph.getRelationships(workspaceId, type, id);
  }
}
