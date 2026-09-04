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

  /// Module 17 — task #484. Every M16/M17 model here predates the
  /// sandbox's generated `@prisma/client` (see `IncidentsService`'s doc
  /// comment for the precedent) — direct casts, same as every other
  /// service that reads these tables.
  private get socTables() {
    return this.prisma as unknown as {
      threatActor: {
        findFirst: (args: unknown) => Promise<{ id: string; name: string; aliases: string[]; source: string } | null>;
        findMany: (args: unknown) => Promise<Array<{ id: string; name: string }>>;
      };
      threatCampaign: {
        findFirst: (args: unknown) => Promise<{ id: string; name: string; source: string } | null>;
        findMany: (args: unknown) => Promise<Array<{ id: string; name: string }>>;
      };
      indicator: {
        findFirst: (args: unknown) => Promise<{ id: string; value: string; type: string; status: string } | null>;
        findMany: (args: unknown) => Promise<Array<{ id: string; value: string }>>;
      };
      incident: {
        findFirst: (args: unknown) => Promise<{ id: string; title: string; severity: string; projectId: string } | null>;
        findMany: (args: unknown) => Promise<Array<{ id: string; title: string }>>;
      };
      remediationTask: {
        findFirst: (args: unknown) => Promise<{ id: string; priority: string; owner: string | null; team: string | null; status: string; findingId: string | null; incidentId: string | null } | null>;
        findMany: (args: unknown) => Promise<Array<{ id: string; priority: string; owner: string | null; team: string | null; status: string }>>;
      };
      assetOwnership: {
        findFirst: (args: unknown) => Promise<{ id: string; targetId: string; owner: string | null; team: string | null; businessCriticality: string } | null>;
      };
      threatRelationship: {
        findMany: (args: unknown) => Promise<Array<{ sourceType: string; sourceId: string; targetType: string; targetId: string; relationType: string }>>;
      };
      incidentFindingLink: { findMany: (args: unknown) => Promise<Array<{ findingId: string }>> };
      incidentEvidenceLink: { findMany: (args: unknown) => Promise<Array<{ evidenceId: string }>> };
      incidentIndicatorLink: { findMany: (args: unknown) => Promise<Array<{ indicatorId: string }>> };
      incidentAssetLink: { findMany: (args: unknown) => Promise<Array<{ targetId: string }>> };
    };
  }

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
      case 'THREAT_ACTOR':
        return this.threatRelationshipEdges(workspaceId, 'ACTOR', id);
      case 'THREAT_CAMPAIGN':
        return this.threatRelationshipEdges(workspaceId, 'CAMPAIGN', id);
      case 'INDICATOR':
        return this.indicatorRelationships(workspaceId, id);
      case 'INCIDENT':
        return this.incidentRelationships(workspaceId, id);
      case 'REMEDIATION_TASK':
        return this.remediationTaskRelationships(workspaceId, id);
      case 'ASSET_OWNER':
        return this.assetOwnerRelationships(workspaceId, id);
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
    // Module 17 — task #484. INCIDENT/REMEDIATION_TASK/ASSET_OWNER filter
    // by `workspaceId` alone (workspace-owned rows). THREAT_ACTOR/
    // THREAT_CAMPAIGN/INDICATOR use the same shared-cache
    // `OR: [{workspaceId},{workspaceId:null}]` scoping their own
    // resolveNode/getRelationships branches above use.
    if (!wantedTypes || wantedTypes.has('INCIDENT')) {
      const rows = await this.socTables.incident.findMany({
        where: { workspaceId, title: insensitive },
        take: perTypeLimit,
      });
      results.push(...rows.map((r) => ({ type: 'INCIDENT' as const, id: r.id, label: r.title, score: 1 })));
    }
    if (!wantedTypes || wantedTypes.has('THREAT_ACTOR')) {
      const rows = await this.socTables.threatActor.findMany({
        where: { OR: [{ workspaceId }, { workspaceId: null }], name: insensitive },
        take: perTypeLimit,
      });
      results.push(...rows.map((r) => ({ type: 'THREAT_ACTOR' as const, id: r.id, label: r.name, score: 1 })));
    }
    if (!wantedTypes || wantedTypes.has('THREAT_CAMPAIGN')) {
      const rows = await this.socTables.threatCampaign.findMany({
        where: { OR: [{ workspaceId }, { workspaceId: null }], name: insensitive },
        take: perTypeLimit,
      });
      results.push(...rows.map((r) => ({ type: 'THREAT_CAMPAIGN' as const, id: r.id, label: r.name, score: 1 })));
    }
    if (!wantedTypes || wantedTypes.has('INDICATOR')) {
      const rows = await this.socTables.indicator.findMany({
        where: { OR: [{ workspaceId }, { workspaceId: null }], value: insensitive },
        take: perTypeLimit,
      });
      results.push(...rows.map((r) => ({ type: 'INDICATOR' as const, id: r.id, label: r.value, score: 1 })));
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
      // Module 17 — task #484. Indicator/ThreatActor/ThreatCampaign are
      // cache-shaped (nullable `workspaceId` — see their own schema doc
      // comments): a private import (`workspaceId` set) or the shared
      // community cache (`workspaceId: null`) both resolve here, same
      // `OR: [{ workspaceId }, { workspaceId: null }]` scoping every
      // other threat-intel read in this codebase uses.
      case 'THREAT_ACTOR': {
        const row = await this.socTables.threatActor.findFirst({ where: { id, OR: [{ workspaceId }, { workspaceId: null }] } });
        return row ? { type, id: row.id, label: row.name, subtitle: row.aliases.join(', ') || row.source } : null;
      }
      case 'THREAT_CAMPAIGN': {
        const row = await this.socTables.threatCampaign.findFirst({ where: { id, OR: [{ workspaceId }, { workspaceId: null }] } });
        return row ? { type, id: row.id, label: row.name, subtitle: row.source } : null;
      }
      case 'INDICATOR': {
        const row = await this.socTables.indicator.findFirst({ where: { id, OR: [{ workspaceId }, { workspaceId: null }] } });
        return row ? { type, id: row.id, label: row.value, subtitle: row.type, metadata: { status: row.status } } : null;
      }
      case 'INCIDENT': {
        const row = await this.socTables.incident.findFirst({ where: { id, workspaceId } });
        return row ? { type, id: row.id, label: row.title, subtitle: row.severity } : null;
      }
      case 'REMEDIATION_TASK': {
        const row = await this.socTables.remediationTask.findFirst({ where: { id, workspaceId } });
        if (!row) return null;
        return {
          type,
          id: row.id,
          label: `${row.priority} remediation — ${row.owner ?? row.team ?? 'unassigned'}`,
          subtitle: row.status,
        };
      }
      case 'ASSET_OWNER': {
        const row = await this.socTables.assetOwnership.findFirst({ where: { id, workspaceId } });
        if (!row) return null;
        return {
          type,
          id: row.id,
          label: row.owner ?? row.team ?? 'Unassigned owner',
          subtitle: row.businessCriticality,
        };
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

  /// Module 17 — task #484. Shared by THREAT_ACTOR/THREAT_CAMPAIGN —
  /// walks the `ThreatRelationship` catalog table both directions
  /// (`objectType`/`objectId` may appear as either `sourceType`/
  /// `sourceId` or `targetType`/`targetId` on a given row), same
  /// bidirectional read `ThreatIntelCatalogService.listRelationships`
  /// already does. Only ACTOR/CAMPAIGN/INDICATOR are mapped to KG node
  /// types below — a REPORT- or TECHNIQUE-typed relationship endpoint is
  /// skipped rather than modeled as a node, matching this pass's scope
  /// (ThreatReport/ThreatTechnique aren't KG node types).
  private async threatRelationshipEdges(
    workspaceId: string,
    objectType: 'ACTOR' | 'CAMPAIGN',
    objectId: string,
  ): Promise<KnowledgeGraphRelationshipDto[]> {
    const rows = await this.socTables.threatRelationship.findMany({
      where: {
        OR: [
          { sourceType: objectType, sourceId: objectId, OR: [{ workspaceId }, { workspaceId: null }] },
          { targetType: objectType, targetId: objectId, OR: [{ workspaceId }, { workspaceId: null }] },
        ],
      },
      take: 50,
    });

    // Module 18 — task #516 (API performance audit). Each row here needs
    // its own resolveNode() call (1-2 queries depending on node type — the
    // CVE branch does two), so this is still one query per row rather than
    // a single batched lookup: resolveNode is a shared per-type dispatcher
    // used by several single-node call sites elsewhere in this service
    // (resolveIncidentAcrossWorkspace, getNode, etc.), and restructuring it
    // into a batch-by-type resolver to fully eliminate the N+1 is a bigger
    // change than fits this phase, unverifiable end-to-end without
    // compilation in this sandbox. Running the up-to-50 lookups
    // concurrently via Promise.all rather than sequentially in a for-await
    // loop (the previous shape) still meaningfully cuts wall-clock latency
    // — this is exactly the path findPath's bounded BFS calls once per
    // frontier node up to depth 4, so sequential round-trips here were
    // compounding badly. Tracked as a concrete follow-up in
    // docs/operations/ (Phase 29) for the full batch-resolver rewrite.
    const resolved = await Promise.all(
      rows.map(async (row) => {
        const other = row.sourceType === objectType && row.sourceId === objectId
          ? { type: row.targetType, id: row.targetId }
          : { type: row.sourceType, id: row.sourceId };
        const kgType = mapThreatObjectType(other.type);
        if (!kgType) return null;
        const node = await this.resolveNode(workspaceId, kgType, other.id);
        return node ? rel(row.relationType, node) : null;
      }),
    );
    return resolved.filter((r): r is KnowledgeGraphRelationshipDto => r != null);
  }

  private async indicatorRelationships(workspaceId: string, indicatorId: string): Promise<KnowledgeGraphRelationshipDto[]> {
    const indicator = await this.socTables.indicator.findFirst({ where: { id: indicatorId, OR: [{ workspaceId }, { workspaceId: null }] } });
    if (!indicator) return [];

    const [threatEdges, incidentLinks] = await Promise.all([
      this.threatRelationshipEdgesForIndicator(workspaceId, indicatorId),
      this.socTables.incidentIndicatorLink.findMany({ where: { indicatorId } }),
    ]);
    const incidentNodes = await Promise.all(
      incidentLinks.map((link) => this.resolveIncidentAcrossWorkspace(workspaceId, link)),
    );
    return [...threatEdges, ...incidentNodes.filter((n): n is KnowledgeGraphRelationshipDto => n != null)];
  }

  /// `threatRelationshipEdges` above is typed to only accept `'ACTOR' |
  /// 'CAMPAIGN'` as the *queried* object type (matching its two KG
  /// callers); Indicator needs the identical bidirectional-lookup logic
  /// against the same table with `objectType: 'INDICATOR'`, so this is a
  /// thin sibling rather than loosening that type for one extra caller.
  private async threatRelationshipEdgesForIndicator(workspaceId: string, indicatorId: string): Promise<KnowledgeGraphRelationshipDto[]> {
    const rows = await this.socTables.threatRelationship.findMany({
      where: {
        OR: [
          { sourceType: 'INDICATOR', sourceId: indicatorId, OR: [{ workspaceId }, { workspaceId: null }] },
          { targetType: 'INDICATOR', targetId: indicatorId, OR: [{ workspaceId }, { workspaceId: null }] },
        ],
      },
      take: 50,
    });
    // Module 18 — task #516. Same fix, same rationale, as the identical
    // loop in threatRelationshipEdges() above — see that method's comment.
    const resolved = await Promise.all(
      rows.map(async (row) => {
        const other = row.sourceType === 'INDICATOR' && row.sourceId === indicatorId
          ? { type: row.targetType, id: row.targetId }
          : { type: row.sourceType, id: row.sourceId };
        const kgType = mapThreatObjectType(other.type);
        if (!kgType) return null;
        const node = await this.resolveNode(workspaceId, kgType, other.id);
        return node ? rel(row.relationType, node) : null;
      }),
    );
    return resolved.filter((r): r is KnowledgeGraphRelationshipDto => r != null);
  }

  private async resolveIncidentAcrossWorkspace(
    workspaceId: string,
    link: { indicatorId: string },
  ): Promise<KnowledgeGraphRelationshipDto | null> {
    // `IncidentIndicatorLink` has no `workspaceId` of its own — the
    // Incident it joins to is the workspace-scoped side, so re-resolve
    // through it (list all incidents that link this indicator, then
    // filter to ones in-workspace) rather than trusting the link row.
    const incidentRow = await this.socTables.incident.findFirst({
      where: { workspaceId, indicatorLinks: { some: { indicatorId: link.indicatorId } } },
    });
    if (!incidentRow) return null;
    return rel('referenced_by', { type: 'INCIDENT', id: incidentRow.id, label: incidentRow.title });
  }

  private async incidentRelationships(workspaceId: string, incidentId: string): Promise<KnowledgeGraphRelationshipDto[]> {
    const [findingLinks, evidenceLinks, indicatorLinks, assetLinks, remediationTasks] = await Promise.all([
      this.socTables.incidentFindingLink.findMany({ where: { incidentId } }),
      this.socTables.incidentEvidenceLink.findMany({ where: { incidentId } }),
      this.socTables.incidentIndicatorLink.findMany({ where: { incidentId } }),
      this.socTables.incidentAssetLink.findMany({ where: { incidentId } }),
      this.socTables.remediationTask.findMany({ where: { workspaceId, incidentId } }),
    ]);

    const [findings, evidence, indicators, targets] = await Promise.all([
      Promise.all(findingLinks.map((l) => this.prisma.bugBountyFinding.findFirst({ where: { id: l.findingId, workspaceId, deletedAt: null } }))),
      Promise.all(evidenceLinks.map((l) => this.prisma.evidence.findFirst({ where: { id: l.evidenceId, deletedAt: null, project: { workspaceId } } }))),
      Promise.all(indicatorLinks.map((l) => this.socTables.indicator.findFirst({ where: { id: l.indicatorId, OR: [{ workspaceId }, { workspaceId: null }] } }))),
      Promise.all(assetLinks.map((l) => this.prisma.target.findFirst({ where: { id: l.targetId, project: { workspaceId } } }))),
    ]);

    return [
      ...findings.filter((f): f is NonNullable<typeof f> => f != null).map((f) => rel('has_finding', { type: 'FINDING', id: f.id, label: f.title })),
      ...evidence.filter((e): e is NonNullable<typeof e> => e != null).map((e) => rel('has_evidence', { type: 'EVIDENCE', id: e.id, label: e.title })),
      ...indicators.filter((i): i is NonNullable<typeof i> => i != null).map((i) => rel('linked_indicator', { type: 'INDICATOR', id: i.id, label: i.value })),
      ...targets.filter((t): t is NonNullable<typeof t> => t != null).map((t) => rel('affects_target', { type: 'TARGET', id: t.id, label: t.value })),
      ...remediationTasks.map((t) => rel('has_remediation', {
        type: 'REMEDIATION_TASK',
        id: t.id,
        label: `${t.priority} remediation — ${t.owner ?? t.team ?? 'unassigned'}`,
      })),
    ];
  }

  private async remediationTaskRelationships(workspaceId: string, taskId: string): Promise<KnowledgeGraphRelationshipDto[]> {
    const task = await this.socTables.remediationTask.findFirst({ where: { id: taskId, workspaceId } });
    if (!task) return [];
    const [finding, incident] = await Promise.all([
      task.findingId ? this.prisma.bugBountyFinding.findFirst({ where: { id: task.findingId, workspaceId, deletedAt: null } }) : Promise.resolve(null),
      task.incidentId ? this.socTables.incident.findFirst({ where: { id: task.incidentId, workspaceId } }) : Promise.resolve(null),
    ]);
    return [
      ...(finding ? [rel('remediates_finding', { type: 'FINDING', id: finding.id, label: finding.title })] : []),
      ...(incident ? [rel('remediates_incident', { type: 'INCIDENT', id: incident.id, label: incident.title })] : []),
    ];
  }

  private async assetOwnerRelationships(workspaceId: string, ownershipId: string): Promise<KnowledgeGraphRelationshipDto[]> {
    const ownership = await this.socTables.assetOwnership.findFirst({ where: { id: ownershipId, workspaceId } });
    if (!ownership) return [];
    const target = await this.prisma.target.findFirst({ where: { id: ownership.targetId, project: { workspaceId } } });
    return target ? [rel('owns_target', { type: 'TARGET', id: target.id, label: target.value })] : [];
  }
}

/// Module 17 — task #484. `ThreatRelationship.sourceType`/`targetType`
/// are free-text (no shared enum exists — see this module's own doc
/// comment on why nothing currently writes rows here), so this maps the
/// handful of object-type strings this KG extension understands onto
/// `KnowledgeGraphNodeType`; anything else (e.g. a future REPORT/
/// TECHNIQUE relationship) is deliberately left unmapped rather than
/// guessed at.
function mapThreatObjectType(objectType: string): KnowledgeGraphNodeType | null {
  switch (objectType) {
    case 'ACTOR':
      return 'THREAT_ACTOR';
    case 'CAMPAIGN':
      return 'THREAT_CAMPAIGN';
    case 'INDICATOR':
      return 'INDICATOR';
    default:
      return null;
  }
}

function rel(relation: string, node: KnowledgeGraphNodeDto): KnowledgeGraphRelationshipDto {
  return { relation, node };
}

function nodeKey(type: KnowledgeGraphNodeType, id: string): string {
  return `${type}:${id}`;
}
