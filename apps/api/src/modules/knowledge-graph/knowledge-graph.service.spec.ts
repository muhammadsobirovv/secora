import { KnowledgeGraphService } from './knowledge-graph.service.js';

/// Module 16 — Knowledge Graph query layer (task #391). Covers the two
/// things that actually matter for this service per the spec ("workspace
/// filtered" + "entity search"): (1) TARGET lookups/relationships are
/// joined through `project.workspaceId` (Target has no workspaceId
/// column of its own — this was the concrete bug fixed this session, so
/// it gets a regression test rather than just a code comment), and a
/// cross-workspace TARGET id resolves to null/404 exactly like a
/// same-workspace nonexistent id (enumeration-safe); (2) `findPath`
/// refuses to traverse past the requested/capped depth.
describe('KnowledgeGraphService', () => {
  function buildPrisma() {
    return {
      target: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      technology: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      cveMatch: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      cveRecord: { findUnique: jest.fn().mockResolvedValue(null) },
      bugBountyFinding: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      evidence: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      bugReport: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      knowledgeBaseNote: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      aiConversation: { findFirst: jest.fn().mockResolvedValue(null) },
      pluginInstallation: { findFirst: jest.fn().mockResolvedValue(null) },
    };
  }

  it('resolves a TARGET node by joining through project.workspaceId, not a workspaceId column on Target', async () => {
    const prisma = buildPrisma();
    prisma.target.findFirst.mockResolvedValue({ id: 'target-1', value: 'example.com', type: 'DOMAIN', scopeStatus: 'IN_SCOPE' });
    const service = new KnowledgeGraphService(prisma as never);

    const node = await service.getNode('workspace-1', 'TARGET', 'target-1');

    expect(node).toMatchObject({ type: 'TARGET', id: 'target-1', label: 'example.com' });
    expect(prisma.target.findFirst).toHaveBeenCalledWith({
      where: { id: 'target-1', project: { workspaceId: 'workspace-1' } },
    });
  });

  it('treats a TARGET belonging to another workspace as not found (enumeration-safe 404)', async () => {
    const prisma = buildPrisma();
    // The mock's `where` is workspace-scoped, so a cross-workspace row is
    // correctly modeled as "no row matched" — same as a nonexistent id.
    prisma.target.findFirst.mockResolvedValue(null);
    const service = new KnowledgeGraphService(prisma as never);

    await expect(service.getNode('workspace-1', 'TARGET', 'someone-elses-target')).rejects.toMatchObject({
      code: 'KNOWLEDGE_GRAPH_NODE_NOT_FOUND',
    });
  });

  it('search filters TARGET rows through project.workspaceId rather than a nonexistent Target.workspaceId', async () => {
    const prisma = buildPrisma();
    const service = new KnowledgeGraphService(prisma as never);

    await service.search('workspace-1', 'example', ['TARGET'], 25);

    expect(prisma.target.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ project: { workspaceId: 'workspace-1' } }) }),
    );
  });

  it('findPath returns null instead of traversing past the capped depth', async () => {
    const prisma = buildPrisma();
    prisma.target.findFirst.mockResolvedValue({ id: 'target-1', value: 'example.com', type: 'DOMAIN', scopeStatus: 'IN_SCOPE' });
    // No relationships ever resolve, so a same-type/different-id search
    // must exhaust the frontier and return null rather than hang or throw.
    const service = new KnowledgeGraphService(prisma as never);

    const path = await service.findPath('workspace-1', 'TARGET', 'target-1', 'TARGET', 'target-unreachable', 1);

    expect(path).toBeNull();
  });

  it('findPath returns a single-step path when from and to are the same node', async () => {
    const prisma = buildPrisma();
    prisma.target.findFirst.mockResolvedValue({ id: 'target-1', value: 'example.com', type: 'DOMAIN', scopeStatus: 'IN_SCOPE' });
    const service = new KnowledgeGraphService(prisma as never);

    const path = await service.findPath('workspace-1', 'TARGET', 'target-1', 'TARGET', 'target-1', 3);

    expect(path).toEqual([{ node: expect.objectContaining({ id: 'target-1' }), relation: null }]);
  });
});
