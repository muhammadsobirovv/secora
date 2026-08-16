import {
  CreateResearcherMemoryEntryCommand,
  CreateResearcherMemoryEntryHandler,
  DeleteResearcherMemoryEntryCommand,
  DeleteResearcherMemoryEntryHandler,
} from './researcher-memory.commands.js';

/// Module 16 — AI Memory (task #397). Covers the two security-relevant
/// behaviours the spec calls out explicitly: (1) deletion is a real
/// delete that also removes the entry from RAG search (no silent
/// persistence after the user asked to remove it), and (2) only
/// IMPORTANT_FINDING/DECISION kinds write an audit event — the spec's
/// "audit important memory mutations", not every trivial note edit.
describe('ResearcherMemoryEntry commands', () => {
  function buildDeps(entryOverrides: Partial<Record<string, unknown>> = {}) {
    const entry = {
      id: 'entry-1',
      workspaceId: 'workspace-1',
      userId: 'user-1',
      kind: 'NOTE',
      title: 'Title',
      content: 'Content',
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      ...entryOverrides,
    };
    const prisma = {
      researcherMemoryEntry: {
        create: jest.fn().mockResolvedValue(entry),
        findFirst: jest.fn().mockResolvedValue(entry),
        delete: jest.fn().mockResolvedValue(entry),
      },
      auditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const workspaceResolver = { resolve: jest.fn().mockResolvedValue('workspace-1') };
    const aiMemory = { indexContent: jest.fn().mockResolvedValue(undefined), deindexContent: jest.fn().mockResolvedValue(undefined) };
    return { prisma, workspaceResolver, aiMemory, entry };
  }

  it('mirrors a new entry into the RAG store on create', async () => {
    const { prisma, workspaceResolver, aiMemory } = buildDeps();
    const handler = new CreateResearcherMemoryEntryHandler(prisma as never, workspaceResolver as never, aiMemory as never);

    await handler.execute(
      new CreateResearcherMemoryEntryCommand('user-1', { kind: 'NOTE', title: 'Title', content: 'Content' }),
    );

    expect(aiMemory.indexContent).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: 'RESEARCHER_MEMORY', sourceId: 'entry-1' }),
    );
  });

  it('does not write an audit event for a NOTE-kind entry', async () => {
    const { prisma, workspaceResolver, aiMemory } = buildDeps({ kind: 'NOTE' });
    const handler = new CreateResearcherMemoryEntryHandler(prisma as never, workspaceResolver as never, aiMemory as never);

    await handler.execute(new CreateResearcherMemoryEntryCommand('user-1', { kind: 'NOTE', title: 'T', content: 'C' }));

    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
  });

  it('writes an AI_MEMORY_ENTRY_MUTATED audit event for an IMPORTANT_FINDING entry', async () => {
    const { prisma, workspaceResolver, aiMemory } = buildDeps({ kind: 'IMPORTANT_FINDING' });
    const handler = new CreateResearcherMemoryEntryHandler(prisma as never, workspaceResolver as never, aiMemory as never);

    await handler.execute(
      new CreateResearcherMemoryEntryCommand('user-1', { kind: 'IMPORTANT_FINDING', title: 'T', content: 'C' }),
    );

    expect(prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'AI_MEMORY_ENTRY_MUTATED' }) }),
    );
  });

  it('deletes the row and de-indexes it from RAG on explicit deletion', async () => {
    const { prisma, workspaceResolver, aiMemory } = buildDeps({ kind: 'DECISION' });
    const handler = new DeleteResearcherMemoryEntryHandler(prisma as never, workspaceResolver as never, aiMemory as never);

    await handler.execute(new DeleteResearcherMemoryEntryCommand('user-1', 'entry-1'));

    expect(prisma.researcherMemoryEntry.delete).toHaveBeenCalledWith({ where: { id: 'entry-1' } });
    expect(aiMemory.deindexContent).toHaveBeenCalledWith('RESEARCHER_MEMORY', 'entry-1');
    expect(prisma.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'AI_MEMORY_ENTRY_MUTATED', metadata: expect.objectContaining({ action: 'deleted' }) }) }),
    );
  });

  it('rejects deleting an entry that does not belong to the caller (workspace/user scoped 404)', async () => {
    const { prisma, workspaceResolver, aiMemory } = buildDeps();
    prisma.researcherMemoryEntry.findFirst.mockResolvedValue(null);
    const handler = new DeleteResearcherMemoryEntryHandler(prisma as never, workspaceResolver as never, aiMemory as never);

    await expect(handler.execute(new DeleteResearcherMemoryEntryCommand('user-1', 'someone-elses-entry'))).rejects.toMatchObject({
      code: 'RESEARCHER_MEMORY_ENTRY_NOT_FOUND',
    });
  });
});
