import { KNOWLEDGE_GRAPH_ENDPOINTS } from '@pentesthub/shared';
import type {
  KnowledgeGraphNodeDto,
  KnowledgeGraphNodeType,
  KnowledgeGraphPathStepDto,
  KnowledgeGraphRelationshipDto,
  KnowledgeGraphSearchResultDto,
} from '@pentesthub/shared';
import { loadConfig } from '../config.js';
import { buildHttpClient } from '../http.js';

function flagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index !== -1 ? args[index + 1] : undefined;
}

export async function knowledgeGraphSearchCommand(args: string[]): Promise<void> {
  const query = args[0];
  if (!query) throw new Error('Usage: pentesthub knowledge-graph search <query> [--types TARGET,FINDING] [--limit 25]');
  const types = flagValue(args, '--types');
  const limit = flagValue(args, '--limit');

  const http = buildHttpClient(loadConfig());
  const results = await http.get<KnowledgeGraphSearchResultDto[]>(KNOWLEDGE_GRAPH_ENDPOINTS.search(), {
    query,
    types,
    limit: limit ? Number(limit) : undefined,
  });
  for (const r of results) {
    console.log(`${r.type}\t${r.id}\t${r.label}`);
  }
}

export async function knowledgeGraphNodeCommand(args: string[]): Promise<void> {
  const type = args[0] as KnowledgeGraphNodeType | undefined;
  const id = args[1];
  if (!type || !id) throw new Error('Usage: pentesthub knowledge-graph node <type> <id>');

  const http = buildHttpClient(loadConfig());
  const node = await http.get<KnowledgeGraphNodeDto>(KNOWLEDGE_GRAPH_ENDPOINTS.node(type, id));
  console.log(JSON.stringify(node, null, 2));
}

export async function knowledgeGraphRelationshipsCommand(args: string[]): Promise<void> {
  const type = args[0] as KnowledgeGraphNodeType | undefined;
  const id = args[1];
  if (!type || !id) throw new Error('Usage: pentesthub knowledge-graph relationships <type> <id>');

  const http = buildHttpClient(loadConfig());
  const relationships = await http.get<KnowledgeGraphRelationshipDto[]>(KNOWLEDGE_GRAPH_ENDPOINTS.relationships(type, id));
  for (const r of relationships) {
    console.log(`${r.relation}\t${r.node.type}\t${r.node.id}\t${r.node.label}`);
  }
}

export async function knowledgeGraphPathCommand(args: string[]): Promise<void> {
  const fromType = args[0] as KnowledgeGraphNodeType | undefined;
  const fromId = args[1];
  const toType = args[2] as KnowledgeGraphNodeType | undefined;
  const toId = args[3];
  if (!fromType || !fromId || !toType || !toId) {
    throw new Error('Usage: pentesthub knowledge-graph path <fromType> <fromId> <toType> <toId> [--max-depth 4]');
  }
  const maxDepth = flagValue(args, '--max-depth');

  const http = buildHttpClient(loadConfig());
  const path = await http.get<KnowledgeGraphPathStepDto[] | null>(KNOWLEDGE_GRAPH_ENDPOINTS.path(), {
    fromType,
    fromId,
    toType,
    toId,
    maxDepth: maxDepth ? Number(maxDepth) : undefined,
  });
  console.log(JSON.stringify(path, null, 2));
}
