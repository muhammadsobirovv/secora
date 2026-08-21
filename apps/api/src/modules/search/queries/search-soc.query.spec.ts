import { describe, expect, it, jest } from '@jest/globals';
import type { WorkspacesRepository } from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import { SearchSocHandler, SearchSocQuery } from './search-soc.query.js';

/// Module 17 — task #488 (Multi-tenant security tests). `SearchSocHandler`
/// (task #483) never fetch-then-compares — every `findMany` call
/// threads the caller's resolved workspace into its own `where` clause,
/// either strictly (Incident/AssetGraphNode/RemediationTask — private
/// per-workspace data) or via the same `OR: [{ workspaceId },
/// { workspaceId: null }]` shared-cache scope threat-intel reads use
/// elsewhere (Indicator/ThreatActor/ThreatCampaign). These tests assert
/// each of the six `findMany` calls receives the correct scope for its
/// entity's isolation posture, and that no query ever runs before the
/// caller's own workspace is resolved.

function buildHandler() {
  // Deliberately the SAME mock fn wired to all six table properties —
  // `execute()`'s `Promise.all([...])` array literal is evaluated
  // left-to-right synchronously, so `findMany.mock.calls[0..5]` still
  // land in the handler's own incident/assetGraphNode/indicator/
  // threatActor/threatCampaign/remediationTask order regardless of
  // which property each call actually went through; a shared mock is
  // simpler than six separate ones for asserting per-call `where`
  // shape, which is all these tests need.
  const findMany = jest.fn<(args: unknown) => Promise<unknown[]>>().mockResolvedValue([]);
  const prisma = {
    incident: { findMany },
    assetGraphNode: { findMany },
    indicator: { findMany },
    threatActor: { findMany },
    threatCampaign: { findMany },
    remediationTask: { findMany },
  } as unknown as ConstructorParameters<typeof SearchSocHandler>[1];

  const workspacesRepository = {
    findPersonalWorkspaceForUser: jest.fn<WorkspacesRepository['findPersonalWorkspaceForUser']>(),
  } as unknown as jest.Mocked<WorkspacesRepository>;

  const handler = new SearchSocHandler(workspacesRepository, prisma);
  return { handler, findMany, workspacesRepository };
}

const MY_WORKSPACE = { id: 'ws-mine' } as Awaited<
  ReturnType<WorkspacesRepository['findPersonalWorkspaceForUser']>
>;

describe('SearchSocHandler (workspace isolation)', () => {
  it('scopes Incident/AssetGraphNode/RemediationTask findMany calls strictly to the caller workspace', async () => {
    const { handler, findMany, workspacesRepository } = buildHandler();
    workspacesRepository.findPersonalWorkspaceForUser.mockResolvedValue(MY_WORKSPACE);

    await handler.execute(new SearchSocQuery('user-1', 'phishing'));

    const calls = findMany.mock.calls.map((c) => c[0] as { where: Record<string, unknown> });
    // Calls 0, 1, 5 are incident/assetGraphNode/remediationTask per the
    // handler's Promise.all ordering — strict workspaceId, no OR-null
    // cache scope (these are never shared/global data).
    for (const idx of [0, 1, 5]) {
      expect(calls[idx]?.where).toMatchObject({ workspaceId: 'ws-mine' });
    }
    // Incident's own `OR` field (title/description text match) never
    // includes a `workspaceId: null` branch — confirms the strict scope
    // isn't accidentally widened into a shared-cache one.
    const incidentOr = (calls[0]?.where.OR as Array<Record<string, unknown>> | undefined) ?? [];
    expect(incidentOr.some((clause) => 'workspaceId' in clause)).toBe(false);
  });

  it('scopes Indicator/ThreatActor/ThreatCampaign findMany calls with the shared-cache OR scope', async () => {
    const { handler, findMany, workspacesRepository } = buildHandler();
    workspacesRepository.findPersonalWorkspaceForUser.mockResolvedValue(MY_WORKSPACE);

    await handler.execute(new SearchSocQuery('user-1', 'apt'));

    const calls = findMany.mock.calls.map((c) => c[0] as { where: { OR: Array<Record<string, unknown>> } });
    // Calls 2, 3, 4 are indicator/threatActor/threatCampaign.
    for (const idx of [2, 3, 4]) {
      const orClause = calls[idx]?.where.OR ?? [];
      expect(orClause).toEqual(
        expect.arrayContaining([{ workspaceId: 'ws-mine' }, { workspaceId: null }]),
      );
    }
  });

  it('throws WORKSPACE_NOT_FOUND and never queries any table when the caller has no personal workspace', async () => {
    const { handler, findMany, workspacesRepository } = buildHandler();
    workspacesRepository.findPersonalWorkspaceForUser.mockResolvedValue(null);

    await expect(handler.execute(new SearchSocQuery('ghost-user', 'anything'))).rejects.toMatchObject({
      code: 'WORKSPACE_NOT_FOUND',
    });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('returns no results and issues no query for a blank search term, even for a valid workspace', async () => {
    const { handler, findMany, workspacesRepository } = buildHandler();
    workspacesRepository.findPersonalWorkspaceForUser.mockResolvedValue(MY_WORKSPACE);

    const result = await handler.execute(new SearchSocQuery('user-1', '   '));
    expect(result).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});
