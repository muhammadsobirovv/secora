import { KNOWLEDGE_GRAPH_ENDPOINTS } from '@pentesthub/shared';
import type {
  KnowledgeGraphNodeDto,
  KnowledgeGraphNodeType,
  KnowledgeGraphPathStepDto,
  KnowledgeGraphRelationshipDto,
  KnowledgeGraphSearchResultDto,
} from '@pentesthub/shared';
import type { HttpClient } from '../http-client.js';

/// Module 16 — Knowledge Graph query layer. Every method operates on the
/// caller's own workspace server-side (see KnowledgeGraphController) — no
/// `workspaceId` parameter here, same as `auth`/`organizations`'s own
/// implicit-caller-identity resources.
export class KnowledgeGraphResource {
  constructor(private readonly http: HttpClient) {}

  search(query: string, types?: KnowledgeGraphNodeType[], limit?: number): Promise<KnowledgeGraphSearchResultDto[]> {
    return this.http.get<KnowledgeGraphSearchResultDto[]>(KNOWLEDGE_GRAPH_ENDPOINTS.search(), {
      query,
      types: types?.join(','),
      limit,
    });
  }

  findPath(
    fromType: KnowledgeGraphNodeType,
    fromId: string,
    toType: KnowledgeGraphNodeType,
    toId: string,
    maxDepth?: number,
  ): Promise<KnowledgeGraphPathStepDto[] | null> {
    return this.http.get<KnowledgeGraphPathStepDto[] | null>(KNOWLEDGE_GRAPH_ENDPOINTS.path(), {
      fromType,
      fromId,
      toType,
      toId,
      maxDepth,
    });
  }

  getNode(type: KnowledgeGraphNodeType, id: string): Promise<KnowledgeGraphNodeDto> {
    return this.http.get<KnowledgeGraphNodeDto>(KNOWLEDGE_GRAPH_ENDPOINTS.node(type, id));
  }

  getRelationships(type: KnowledgeGraphNodeType, id: string): Promise<KnowledgeGraphRelationshipDto[]> {
    return this.http.get<KnowledgeGraphRelationshipDto[]>(KNOWLEDGE_GRAPH_ENDPOINTS.relationships(type, id));
  }
}
