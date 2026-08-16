import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  KnowledgeGraphNodeDto,
  KnowledgeGraphNodeType,
  KnowledgeGraphPathStepDto,
  KnowledgeGraphRelationshipDto,
  KnowledgeGraphSearchResultDto,
} from '@pentesthub/shared';
import { AppException } from '../../common/exceptions/app.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';

/// Module 16 — Knowledge Graph query layer (task #391). Every method
/// takes `workspaceId` first and threads it through every underlying
/// Prisma query — there is no code path in this service that queries an
/// entity table without a `workspaceId` (or, for the global `CveRecord`
/// cache, its workspace-scoped `CveMatch` join row) in the `WHERE`
/// clause, which is what makes "do not expose graph data from another
/// tenant through relationships" true by construction rather than by
/// convention: a relationship can only ever be resolved by re-querying
/// the target entity's own table with the same `workspaceId`, so
/// crossing into another workspace would require that workspace's id to
/// already be known and passed in explicitly, which no caller of this
/// service does.
@Injectable()
export class KnowledgeGraphService {
  constructor(private readonly prisma: PrismaService) {}

  async getNode(workspaceId: string, type: KnowledgeGraphNodeType, id: string): Promise<KnowledgeGraphNodeDto> {
    const node = await this.resolveNode(workspaceId, type, id);
    if (!node) {
      throw new AppException('KNOWLEDGE_GRAPH_NODE_NOT_FOUND', 'Knowledge graph node not found.', HttpStatus.NOT_FOUND);
    }
    return node;
  }

  async getRelationships(
    workspaceId: string,
    type: KnowledgeGraphNodeType,
    id: string,
  ): Promise<KnowledgeGraphRelationshipDto[]> {
    // Confirms the node itself is real and in-workspace before walking
    // any relationship off of it — same enumeration-safe-404 shape used
    // everywhere else in this codebase.
    await this.getNode(workspaceId, type, id);

    switch (type) {
      case 'TARGET':
        return this.targetRelationships(workspaceId, id);
      case 'TECHNOLOGY':
        return this.technologyRelationships(workspaceId, id);
      case 'CVE':
        return this.cveRelationships(workspaceId, id);
      case 'FINDING':
        return this.findingRelationships(workspaceId, id);
      case 'EVIDENCE':
        return this.evidenceRelationships(workspaceId, id);
      case 'REPORT':
        return this.reportRelationships(workspaceId, id);
      case 'NOTE':
      case 'KNOWLEDGE_DOCUMENT':
        return this.noteRelationships(workspaceId, id);
      // AI_CONVERSATION and PLUGIN nodes exist and can be looked up, but
      // this pass doesn't model outgoing edges for them (an AI
      // conversation's relevant context is its own messages/tool calls,
      // already exposed by the Module 5/11 chat API; a plugin
      // installation's relevant relations are its permission grants,
      // already exposed by the M13 Plugin API) — a disclosed scope
      // decision, not an oversight.
      case 'AI_CONVERSATION':
      case 'PLUGIN':
        return [];
      default: {
        const exhaustive: never = type;
        return exhaustive;
      }
    }
  }

  /// Bounded-depth BFS over `getRelationships` — the graph has no
  /// persisted adjacency list, so "path" is computed live, hop by hop.
  /// `maxDepth` directly bounds query cost (each hop is one
  /// `getRelationships` call per frontier node); capped at 4 regardless
  /// of what's requested so a caller can't force an unbounded traversal.
  async findPath(
    workspaceId: string,
    fromType: KnowledgeGraphNodeType,
    fromId: string,
    toType: KnowledgeGraphNodeType,
    toId: string,
    maxDepth = 3,
  ): Promise<KnowledgeGraphPathStepDto[] | null> {
    const depthCap = Math.min(Math.max(maxDepth, 1), 4);
    const start = await this.getNode(workspaceId, fromType, fromId);
    if (fromType === toType && fromId === toId) {
      return [{ node: start, relation: null }];
    }

    type Frontier = { node: KnowledgeGraphNodeDto; path: KnowledgeGraphPathStepDto[] };
    let frontier: Frontier[] = [{ node: start, path: [{ node: start, relation: null }] }];
    const visited = new Set<string>([nodeKey(fromType, fromId)]);

    for (let depth = 0; depth < depthCap; depth++) {
      const nextFrontier: Frontier[] = [];
      for (const current of frontier) {
        const relationships = await this.getRelationships(
          workspaceId,
          current.node.type,
          current.node.id,
        );
        for (const rel of relationships) {
          const key = nodeKey(rel.node.type, rel.node.id);
          if (visited.has(key)) continue;
          const nextPath = [...current.path, { node: rel.node, relation: rel.relation }];
          if (rel.node.type === toType && rel.node.id === toId) {
            return nextPath;
          }
          visited.add(key);
          nextFrontier.push({ node: rel.node, path: nextPath });
        }
      }
      frontier = nextFrontier;
      if (frontier.length === 0) break;
    }
    return null;
  }

  /// Simple case-insensitive substring search across the entity types'
  /// own name/title columns — "entity search" (spec), not a full-text or
  /// semantic search engine (that's what AiMemoryService.search/RAG is
  /// for; see AI Memory). Every branch filters by `workspaceId` first.
  async search(
    workspaceId: string,
    query: string,
    types: KnowledgeGraphNodeType[] | undefined,
    limit: number,
  ): Promise<KnowledgeGraphSearchResultDto[]> {
    const wantedTypes = types && types.length > 0 ? new Set(types) : null;
    const results: KnowledgeGraphSearchResultDto[] = [];
    const perTypeLimit = Math.min(limit, 50);
    const insensitive = { contains: query, mode: 'insensitive' as const };

    if (!wantedTypes || wantedTypes.has('TARGET')) {
      // Target has no workspaceId column — filter through its Project.
      const rows = await this.prisma.target.findMany({
        where: { project: { workspaceId }, value: insensitive },
        take: perTypeLimit,
      });
      results.push(...rows.map((r) => ({ type: 'TARGET' as const, id: r.id, label: r.value, score: 1 })));
    }
    if (!wantedTypes || wantedTypes.has('TECHNOLOGY')) {
      const rows = await this.prisma.technology.findMany({
        where: { workspaceId, name: insensitive },
        take: perTypeLimit,
      });
      results.push(...rows.map((r) => ({ type: 'TECHNOLOGY' as const, id: r.id, label: r.name, score: 1 })));
    }
    if (!wantedTypes || wantedTypes.has('FINDING')) {
      const rows = await this.prisma.bugBountyFinding.findMany({
        where: { workspaceId, deletedAt: null, title: insensitive },
        take: perTypeLimit,
      });
      results.push(...rows.map((r) => ({ type: 'FINDING' as const, id: r.id, label: r.title, score: 1 })));
    }
    if (!wantedTypes || wantedTypes.has('REPORT')) {
      const rows = await this.prisma.bugReport.findMany({
        where: { workspaceId, title: insensitive },
        take: perTypeLimit,
      });
      results.push(...rows.map((r) => ({ type: 'REPORT' as const, id: r.id, label: r.title, score: 1 })));
    }
    if (!wantedTypes || wantedTypes.has('EVIDENCE')) {
      const rows = await this.prisma.evidence.findMany({
        where: { deletedAt: null, title: insensitive, project: { workspaceId } },
        take: perTypeLimit,
      });
      results.push(...rows.map((r) => ({ type: 'EVIDENCE' as const, id: r.id, label: r.title, score: 1 })));
    }
    if (!wantedTypes || wantedTypes.has('NOTE') || wantedTypes.has('KNOWLEDGE_DOCUMENT')) {
      const rows = await this.prisma.knowledgeBaseNote.findMany({
        where: { workspaceId, deletedAt: null, OR: [{ title: insensitive }, { contentMarkdown: insensitive }] },
        take: perTypeLimit,
      });
      results.push(
        ...rows.map((r) => ({
          type: 'NOTE' as const,
          id: r.id,
          label: r.title ?? '(untitled note)',
          score: 1,
        })),
      );
    }
    if (!wantedTypes || wantedTypes.has('CVE')) {
      const matches = await this.prisma.cveMatch.findMany({
        where: { workspaceId, cveId: insensitive },
        take: perTypeLimit,
        distinct: ['cveId'],
      });
      results.push(...matches.map((m) => ({ type: 'CVE' as const, id: m.cveId, label: m.cveId, score: 1 })));
    }

    return results.slice(0, limit);
  }

  // --- Node resolution ---------------------------------------------------

  private async resolveNode(
    workspaceId: string,
    type: KnowledgeGraphNodeType,
    id: string,
  ): Promise<KnowledgeGraphNodeDto | null> {
    switch (type) {
      case 'TARGET': {
        // Target has no `workspaceId` column of its own (only
        // `projectId`) — resolved via its owning Project the same way
        // every other Target lookup in this codebase does.
        const row = await this.prisma.target.findFirst({ where: { id, project: { workspaceId } } });
        return row ? { type, id: row.id, label: row.value, subtitle: row.type, metadata: { scopeStatus: row.scopeStatus } } : null;
      }
      case 'TECHNOLOGY': {
        const row = await this.prisma.technology.findFirst({ where: { id, workspaceId } });
        return row ? { type, id: row.id, label: row.name, subtitle: row.version ?? undefined } : null;
      }
      case 'CVE': {
        const match = await this.prisma.cveMatch.findFirst({ where: { workspaceId, cveId: id } });
        if (!match) return null;
        const record = await this.prisma.cveRecord.findUnique({ where: { cveId: id } });
        return { type, id, label: id, subtitle: record?.cwe ?? undefined, metadata: { cvssScore: record?.cvssScore ?? null } };
      }
      case 'FINDING': {
        const row = await this.prisma.bugBountyFinding.findFirst({ where: { id, workspaceId, deletedAt: null } });
        return row ? { type, id: row.id, label: row.title, subtitle: row.severity } : null;
      }
      case 'EVIDENCE': {
        const row = await this.prisma.evidence.findFirst({ where: { id, deletedAt: null, project: { workspaceId } } });
        return row ? { type, id: row.id, label: row.title, subtitle: row.type } : null;
      }
      case 'REPORT': {
        const row = await this.prisma.bugReport.findFirst({ where: { id, workspaceId } });
        return row ? { type, id: row.id, label: row.title, subtitle: row.status } : null;
      }
      case 'NOTE':
      case 'KNOWLEDGE_DOCUMENT': {
        const row = await this.prisma.knowledgeBaseNote.findFirst({ where: { id, workspaceId, deletedAt: null } });
        return row ? { type, id: row.id, label: row.title ?? '(untitled note)' } : null;
      }
      case 'AI_CONVERSATION': {
        const row = await this.prisma.aiConversation.findFirst({ where: { id, workspaceId } });
        return row ? { type, id: row.id, label: row.title ?? '(untitled conversation)' } : null;
      }
      case 'PLUGIN': {
        const row = await this.prisma.pluginInstallation.findFirst({
          where: { id, workspaceId },
          include: { plugin: true },
        });
        return row ? { type, id: row.id, label: row.plugin.name, subtitle: row.enabled ? 'enabled' : 'disabled' } : null;
      }
      default: {
        const exhaustive: never = type;
        return exhaustive;
      }
    }
  }

  // --- Relationship resolution --------------------------------------------

  private async targetRelationships(workspaceId: string, targetId: string): Promise<KnowledgeGraphRelationshipDto[]> {
    const [technologies, findings, evidence, notes] = await Promise.all([
      this.prisma.technology.findMany({ where: { workspaceId, targetId } }),
      this.prisma.bugBountyFinding.findMany({ where: { workspaceId, targetId, deletedAt: null } }),
      this.prisma.evidence.findMany({ where: { targetId, deletedAt: null, project: { workspaceId } } }),
      this.prisma.knowledgeBaseNote.findMany({ where: { workspaceId, targetId, deletedAt: null } }),
    ]);
    return [
      ...technologies.map((t) => rel('runs_technology', { type: 'TECHNOLOGY', id: t.id, label: t.name })),
      ...findings.map((f) => rel('has_finding', { type: 'FINDING', id: f.id, label: f.title })),
      ...evidence.map((e) => rel('has_evidence', { type: 'EVIDENCE', id: e.id, label: e.title })),
      ...notes.map((n) => rel('has_note', { type: 'NOTE', id: n.id, label: n.title ?? '(untitled note)' })),
    ];
  }

  private async technologyRelationships(workspaceId: string, technologyId: string): Promise<KnowledgeGraphRelationshipDto[]> {
    const technology = await this.prisma.technology.findFirst({ where: { id: technologyId, workspaceId } });
    if (!technology) return [];
    const [target, matches] = await Promise.all([
      this.prisma.target.findFirst({ where: { id: technology.targetId, project: { workspaceId } } }),
      this.prisma.cveMatch.findMany({ where: { workspaceId, technologyId }, distinct: ['cveId'] }),
    ]);
    return [
      ...(target ? [rel('detected_on', { type: 'TARGET', id: target.id, label: target.value })] : []),
      ...matches.map((m) => rel('matches_cve', { type: 'CVE', id: m.cveId, label: m.cveId })),
    ];
  }

  private async cveRelationships(workspaceId: string, cveId: string): Promise<KnowledgeGraphRelationshipDto[]> {
    const matches = await this.prisma.cveMatch.findMany({ where: { workspaceId, cveId }, distinct: ['technologyId'] });
    const technologyIds = matches.map((m) => m.technologyId).filter((id): id is string => id != null);
    if (technologyIds.length === 0) return [];
    const technologies = await this.prisma.technology.findMany({ where: { id: { in: technologyIds }, workspaceId } });
    return technologies.map((t) => rel('affects_technology', { type: 'TECHNOLOGY', id: t.id, label: t.name }));
  }

  private async findingRelationships(workspaceId: string, findingId: string): Promise<KnowledgeGraphRelationshipDto[]> {
    const finding = await this.prisma.bugBountyFinding.findFirst({ where: { id: findingId, workspaceId, deletedAt: null } });
    if (!finding) return [];
    const [target, reports, notes] = await Promise.all([
      finding.targetId
        ? this.prisma.target.findFirst({ where: { id: finding.targetId, project: { workspaceId } } })
        : Promise.resolve(null),
      this.prisma.bugReport.findMany({ where: { workspaceId, findingId } }),
      this.prisma.knowledgeBaseNote.findMany({ where: { workspaceId, findingId, deletedAt: null } }),
    ]);
    return [
      ...(target ? [rel('found_on', { type: 'TARGET', id: target.id, label: target.value })] : []),
      ...reports.map((r) => rel('reported_in', { type: 'REPORT', id: r.id, label: r.title })),
      ...notes.map((n) => rel('has_note', { type: 'NOTE', id: n.id, label: n.title ?? '(untitled note)' })),
    ];
  }

  private async evidenceRelationships(workspaceId: string, evidenceId: string): Promise<KnowledgeGraphRelationshipDto[]> {
    const evidence = await this.prisma.evidence.findFirst({
      where: { id: evidenceId, deletedAt: null, project: { workspaceId } },
    });
    if (!evidence?.targetId) return [];
    const target = await this.prisma.target.findFirst({ where: { id: evidence.targetId, project: { workspaceId } } });
    return target ? [rel('captured_on', { type: 'TARGET', id: target.id, label: target.value })] : [];
  }

  private async reportRelationships(workspaceId: string, reportId: string): Promise<KnowledgeGraphRelationshipDto[]> {
    const report = await this.prisma.bugReport.findFirst({ where: { id: reportId, workspaceId } });
    if (!report) return [];
    const [finding, notes] = await Promise.all([
      report.findingId
        ? this.prisma.bugBountyFinding.findFirst({ where: { id: report.findingId, workspaceId, deletedAt: null } })
        : Promise.resolve(null),
      this.prisma.knowledgeBaseNote.findMany({ where: { workspaceId, reportId, deletedAt: null } }),
    ]);
    return [
      ...(finding ? [rel('reports_finding', { type: 'FINDING', id: finding.id, label: finding.title })] : []),
      ...notes.map((n) => rel('has_note', { type: 'NOTE', id: n.id, label: n.title ?? '(untitled note)' })),
    ];
  }

  private async noteRelationships(workspaceId: string, noteId: string): Promise<KnowledgeGraphRelationshipDto[]> {
    const note = await this.prisma.knowledgeBaseNote.findFirst({ where: { id: noteId, workspaceId, deletedAt: null } });
    if (!note) return [];
    const [target, finding, report] = await Promise.all([
      note.targetId
        ? this.prisma.target.findFirst({ where: { id: note.targetId, project: { workspaceId } } })
        : Promise.resolve(null),
      note.findingId
        ? this.prisma.bugBountyFinding.findFirst({ where: { id: note.findingId, workspaceId, deletedAt: null } })
        : Promise.resolve(null),
      note.reportId ? this.prisma.bugReport.findFirst({ where: { id: note.reportId, workspaceId } }) : Promise.resolve(null),
    ]);
    return [
      ...(target ? [rel('about_target', { type: 'TARGET', id: target.id, label: target.value })] : []),
      ...(finding ? [rel('about_finding', { type: 'FINDING', id: finding.id, label: finding.title })] : []),
      ...(report ? [rel('about_report', { type: 'REPORT', id: report.id, label: report.title })] : []),
    ];
  }
}

function rel(relation: string, node: KnowledgeGraphNodeDto): KnowledgeGraphRelationshipDto {
  return { relation, node };
}

function nodeKey(type: KnowledgeGraphNodeType, id: string): string {
  return `${type}:${id}`;
}
