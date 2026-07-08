import type { SearchResultDto } from '@pentesthub/shared';

/// Port — foundation only. PrismaIlikeSearchService is a simple
/// case-insensitive `contains` query across Projects/Targets/Notes/
/// Evidence; a real search engine (Meilisearch/Typesense/Elasticsearch)
/// is a new adapter behind this same interface later, not a rewrite of
/// any feature module (docs/adr/0002-workspace-foundation-module.md,
/// Decision 10). Future modules plug into the same interface rather than
/// building their own search.
export interface SearchService {
  search(workspaceId: string, query: string): Promise<SearchResultDto[]>;
}

export const SEARCH_SERVICE = Symbol('SEARCH_SERVICE');
