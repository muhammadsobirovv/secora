import { Injectable, Logger } from '@nestjs/common';
import type { AssetGraphDto, AssetGraphNodeType, AttackSurfaceSummaryDto } from '@pentesthub/shared';
import { PrismaService } from '../../prisma/prisma.service.js';

interface NodeRow {
  id: string;
  nodeType: AssetGraphNodeType;
  refId: string;
  label: string;
  metadata: unknown;
}

interface EdgeRow {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  edgeType: string;
  metadata: unknown;
}

const TARGET_TYPE_TO_NODE_TYPE: Record<string, AssetGraphNodeType> = {
  DOMAIN: 'DOMAIN',
  SUBDOMAIN: 'SUBDOMAIN',
  URL: 'URL',
  IP_ADDRESS: 'IP',
  CIDR: 'IP',
  API: 'URL',
  MOBILE_APP: 'CLOUD_ASSET',
  INTERNAL_ASSET: 'CLOUD_ASSET',
};

/// Module 16 — task #373. A refreshable *cache* of the asset relationship
/// graph — `rebuild()` derives every node/edge from Target/ReconFinding/
/// Technology/BugBountyFinding and replaces this target's rows, the same
/// "read-through, don't duplicate" posture Module 6's Asset Inventory
/// established (see schema.prisma's doc comment on AssetGraphNode). Not
/// a new source of truth: deleting a graph row never deletes the
/// underlying Recon finding/Technology/Finding it was derived from.
@Injectable()
export class AssetGraphService {
  private readonly logger = new Logger(AssetGraphService.name);

  constructor(private readonly prisma: PrismaService) {}

  async rebuild(targetId: string): Promise<void> {
    const target = await this.prisma.target.findUnique({ where: { id: targetId } });
    if (!target) return;

    const prismaAny = this.prisma as unknown as {
      assetGraphEdge: { deleteMany: (args: unknown) => Promise<unknown> };
      assetGraphNode: {
        deleteMany: (args: unknown) => Promise<unknown>;
        create: (args: unknown) => Promise<{ id: string }>;
      };
    };

    // Edges reference nodes by id (FK, onDelete: Cascade) — clear edges
    // first isn't strictly required since Cascade handles it, but doing
    // it explicitly keeps the two deletes independently reasoned about.
    const existingNodes = await (
      this.prisma as unknown as {
        assetGraphNode: { findMany: (args: unknown) => Promise<{ id: string }[]> };
      }
    ).assetGraphNode.findMany({ where: { targetId }, select: { id: true } });
    if (existingNodes.length > 0) {
      await prismaAny.assetGraphEdge.deleteMany({
        where: {
          OR: [
            { fromNodeId: { in: existingNodes.map((n) => n.id) } },
            { toNodeId: { in: existingNodes.map((n) => n.id) } },
          ],
        },
      });
    }
    await prismaAny.assetGraphNode.deleteMany({ where: { targetId } });

    const rootType = TARGET_TYPE_TO_NODE_TYPE[target.type] ?? 'DOMAIN';
    const rootNode = await prismaAny.assetGraphNode.create({
      data: {
        workspaceId: target.workspaceId,
        projectId: target.projectId,
        targetId,
        nodeType: rootType,
        refId: target.id,
        label: target.value,
        metadata: { targetType: target.type },
      },
    });

    const createEdge = async (
      fromNodeId: string,
      toNodeId: string,
      edgeType: string,
    ): Promise<void> => {
      try {
        await (
          this.prisma as unknown as {
            assetGraphEdge: { create: (args: unknown) => Promise<unknown> };
          }
        ).assetGraphEdge.create({
          data: { workspaceId: target.workspaceId, fromNodeId, toNodeId, edgeType },
        });
      } catch {
        // @@unique([fromNodeId, toNodeId, edgeType]) — a duplicate is
        // harmless (means this exact edge was already derived once in
        // this rebuild pass from a different source finding).
      }
    };

    // Recon findings -> graph nodes, one edge back to the root per node.
    const findingTypeToNodeType: Record<string, { nodeType: AssetGraphNodeType; edge: string }> = {
      SUBDOMAIN: { nodeType: 'SUBDOMAIN', edge: 'CONTAINS' },
      URL: { nodeType: 'URL', edge: 'HOSTS' },
      OPEN_PORT: { nodeType: 'PORT', edge: 'HOSTS' },
      CERTIFICATE: { nodeType: 'CERTIFICATE', edge: 'USES' },
      ASN: { nodeType: 'ASN', edge: 'BELONGS_TO' },
    };

    for (const [reconType, { nodeType, edge }] of Object.entries(findingTypeToNodeType)) {
      const findings = await this.prisma.reconFinding.findMany({
        where: { targetId, type: reconType as never },
        select: { id: true, value: true, data: true },
        take: 500,
      });
      for (const finding of findings) {
        const node = await prismaAny.assetGraphNode.create({
          data: {
            workspaceId: target.workspaceId,
            projectId: target.projectId,
            targetId,
            nodeType,
            refId: finding.id,
            label: finding.value,
            metadata: finding.data ?? undefined,
          },
        });
        await createEdge(rootNode.id, node.id, edge);
      }
    }

    // Technology rows -> TECHNOLOGY nodes, root USES technology.
    const technologies = await (
      this.prisma as unknown as {
        technology: {
          findMany: (args: unknown) => Promise<{ id: string; name: string; version: string | null }[]>;
        };
      }
    ).technology.findMany({ where: { targetId } });
    for (const tech of technologies) {
      const node = await prismaAny.assetGraphNode.create({
        data: {
          workspaceId: target.workspaceId,
          projectId: target.projectId,
          targetId,
          nodeType: 'TECHNOLOGY',
          refId: tech.id,
          label: tech.version ? `${tech.name} ${tech.version}` : tech.name,
        },
      });
      await createEdge(rootNode.id, node.id, 'USES');
    }

    // BugBountyFinding rows against this target -> FINDING nodes, root
    // AFFECTED_BY finding.
    const bbFindings = await this.prisma.bugBountyFinding.findMany({
      where: { targetId },
      select: { id: true, title: true },
      take: 200,
    });
    for (const bf of bbFindings) {
      const node = await prismaAny.assetGraphNode.create({
        data: {
          workspaceId: target.workspaceId,
          projectId: target.projectId,
          targetId,
          nodeType: 'FINDING',
          refId: bf.id,
          label: bf.title,
        },
      });
      await createEdge(rootNode.id, node.id, 'AFFECTED_BY');
    }

    this.logger.log(`Rebuilt asset graph for target ${targetId}`);
  }

  async getForTarget(targetId: string): Promise<AssetGraphDto> {
    const nodes = await (
      this.prisma as unknown as {
        assetGraphNode: { findMany: (args: unknown) => Promise<NodeRow[]> };
      }
    ).assetGraphNode.findMany({ where: { targetId } });

    const nodeIds = nodes.map((n) => n.id);
    const edges =
      nodeIds.length === 0
        ? []
        : await (
            this.prisma as unknown as {
              assetGraphEdge: { findMany: (args: unknown) => Promise<EdgeRow[]> };
            }
          ).assetGraphEdge.findMany({
            where: { OR: [{ fromNodeId: { in: nodeIds } }, { toNodeId: { in: nodeIds } }] },
          });

    return {
      targetId,
      nodes: nodes.map((n) => ({
        id: n.id,
        nodeType: n.nodeType,
        refId: n.refId,
        label: n.label,
        metadata: (n.metadata as Record<string, unknown> | null) ?? null,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        fromNodeId: e.fromNodeId,
        toNodeId: e.toNodeId,
        edgeType: e.edgeType as AssetGraphDto['edges'][number]['edgeType'],
        metadata: (e.metadata as Record<string, unknown> | null) ?? null,
      })),
      generatedAt: new Date().toISOString(),
    };
  }

  /// Module 16 — task #375. Aggregates counts across every target in a
  /// project from the same already-derived data (Asset Graph node counts
  /// by type, plus a 7-day new/removed delta from ChangeDetectionEvent) —
  /// no separate computation pipeline.
  async attackSurfaceForProject(projectId: string): Promise<AttackSurfaceSummaryDto> {
    const nodeModel = (
      this.prisma as unknown as {
        assetGraphNode: { groupBy: (args: unknown) => Promise<{ nodeType: string; _count: number }[]> };
      }
    ).assetGraphNode;

    const grouped = await nodeModel.groupBy({
      by: ['nodeType'],
      where: { projectId },
      _count: true,
    });
    const countOf = (type: string): number =>
      grouped.find((g) => g.nodeType === type)?._count ?? 0;

    const totalAssets = grouped.reduce((sum, g) => sum + g._count, 0);

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const changeModel = (
      this.prisma as unknown as {
        changeDetectionEvent: { count: (args: unknown) => Promise<number> };
      }
    ).changeDetectionEvent;
    const newAssets7d = await changeModel.count({
      where: {
        projectId,
        detectedAt: { gte: sevenDaysAgo },
        changeType: { in: ['NEW_SUBDOMAIN', 'NEW_PORT', 'NEW_ENDPOINT'] },
      },
    });
    const removedAssets7d = await changeModel.count({
      where: {
        projectId,
        detectedAt: { gte: sevenDaysAgo },
        changeType: { in: ['REMOVED_SUBDOMAIN', 'CLOSED_PORT'] },
      },
    });

    const highRiskAssets = await this.prisma.bugBountyFinding.count({
      where: { projectId, severity: { in: ['CRITICAL', 'HIGH'] } },
    });

    return {
      totalAssets,
      liveHosts: countOf('SUBDOMAIN') + countOf('DOMAIN'),
      openPorts: countOf('PORT'),
      httpServices: countOf('URL'),
      endpoints: countOf('ENDPOINT'),
      technologies: countOf('TECHNOLOGY'),
      potentialFindings: countOf('FINDING'),
      highRiskAssets,
      newAssets7d,
      removedAssets7d,
    };
  }
}
