// Module 16 — Knowledge Graph query layer (task #391). A read-only view
// over already-existing entities/relationships (Target, Technology, CVE,
// BugBountyFinding, Evidence, BugReport, KnowledgeBaseNote,
// AiConversation, PluginInstallation) — there is no separate persisted
// graph store; "nodes" and "relationships" here are computed from
// existing foreign keys at query time. Every node/relationship lookup is
// workspace-filtered server-side (see apps/api's
// KnowledgeGraphService) — a caller can never reach a node belonging to
// another workspace, including transitively through a relationship.

export type KnowledgeGraphNodeType =
  | "TARGET"
  | "TECHNOLOGY"
  | "CVE"
  | "FINDING"
  | "EVIDENCE"
  | "REPORT"
  | "NOTE"
  | "AI_CONVERSATION"
  | "PLUGIN"
  | "KNOWLEDGE_DOCUMENT";

export interface KnowledgeGraphNodeDto {
  type: KnowledgeGraphNodeType;
  id: string;
  label: string;
  subtitle?: string | null;
  metadata?: Record<string, unknown>;
}

export interface KnowledgeGraphRelationshipDto {
  /// Short verb describing the edge from the *queried* node to `node`,
  /// e.g. "detected_on", "has_finding", "matches_cve" — always read as
  /// "<queried node> <relation> <node>".
  relation: string;
  node: KnowledgeGraphNodeDto;
}

export interface KnowledgeGraphSearchResultDto extends KnowledgeGraphNodeDto {
  /// Rough relevance signal (currently: 1 for a title/name exact
  /// substring match, lower for a looser match) — not a real ranking
  /// model, just enough to sort "best match first".
  score: number;
}

export interface KnowledgeGraphPathStepDto {
  node: KnowledgeGraphNodeDto;
  relation: string | null;
}

export interface KnowledgeGraphSearchQueryDto {
  query: string;
  types?: KnowledgeGraphNodeType[];
  limit?: number;
}

export interface KnowledgeGraphPathQueryDto {
  fromType: KnowledgeGraphNodeType;
  fromId: string;
  toType: KnowledgeGraphNodeType;
  toId: string;
  /// Bounded search depth — the graph is computed on the fly per hop, so
  /// this directly controls query cost. 3 covers every relationship this
  /// module models (nothing is more than 2-3 hops apart).
  maxDepth?: number;
}
