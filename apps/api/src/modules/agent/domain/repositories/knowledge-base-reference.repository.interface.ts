import type { KnowledgeBaseReferenceFramework } from '@pentesthub/shared';

export interface KnowledgeBaseReferenceEntryRecord {
  id: string;
  framework: KnowledgeBaseReferenceFramework;
  code: string;
  title: string;
  summary: string;
  url: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertKnowledgeBaseReferenceEntryInput {
  framework: KnowledgeBaseReferenceFramework;
  code: string;
  title: string;
  summary: string;
  url?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ListKnowledgeBaseReferenceFilter {
  framework?: KnowledgeBaseReferenceFramework;
  limit?: number;
}

/// The AI Knowledge Base's structured catalog (task #227) — the canonical
/// OWASP/CWE/CAPEC/MITRE ATT&CK/NIST/CVE index. Deliberately *not*
/// workspace-scoped, unlike every other repository in this codebase: this
/// is read-mostly reference material shared across every workspace on the
/// deployment (an OWASP Top 10 entry means the same thing to everyone),
/// same reasoning as `KnowledgeBaseReferenceEntry` having no
/// `workspaceId` column in schema.prisma. Raw SQL throughout — this model
/// was added via the same hand-applied Module 11 migration as
/// OrchestrationRun/AgentTask, so it has no generated Prisma Client
/// support either (see PrismaAgentOrchestrationRepository's doc comment).
export interface KnowledgeBaseReferenceRepository {
  /// Insert-or-update keyed on the (framework, code) unique constraint —
  /// this is how both the one-time seed data load and any agent-authored
  /// entry (e.g. ExploitAnalysisAgent citing a CVE it researched) write to
  /// this table; there's no separate plain `create`.
  upsert(
    input: UpsertKnowledgeBaseReferenceEntryInput,
  ): Promise<KnowledgeBaseReferenceEntryRecord>;
  findById(id: string): Promise<KnowledgeBaseReferenceEntryRecord | null>;
  findByFrameworkAndCode(
    framework: KnowledgeBaseReferenceFramework,
    code: string,
  ): Promise<KnowledgeBaseReferenceEntryRecord | null>;
  list(
    filter: ListKnowledgeBaseReferenceFilter,
  ): Promise<KnowledgeBaseReferenceEntryRecord[]>;
  delete(id: string): Promise<void>;
  count(): Promise<number>;
}

export const KNOWLEDGE_BASE_REFERENCE_REPOSITORY = Symbol(
  'KNOWLEDGE_BASE_REFERENCE_REPOSITORY',
);
