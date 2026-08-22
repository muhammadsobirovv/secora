import { describe, expect, it, jest } from '@jest/globals';
import { SocController } from './soc.controller.js';

/// Module 17 — task #496 (Tests: SOC auth). `SocController` never takes
/// a workspaceId from the request — `resolveWorkspaceId` always derives
/// it server-side from the authenticated caller's own personal
/// workspace via `WorkspacesRepository.findPersonalWorkspaceForUser`.
/// This is the actual "SOC auth" guarantee: there is no query param, no
/// body field, and no header a client can set to make `/soc/dashboard`
/// return a different workspace's data. Covers both that the resolved
/// (not client-supplied) workspaceId reaches `SocService.dashboard`, and
/// that a caller with no personal workspace gets a clean 404 rather than
/// a crash or a fallback to someone else's data.

function buildController() {
  const dashboard = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const soc = { dashboard } as unknown as ConstructorParameters<typeof SocController>[0];

  const findPersonalWorkspaceForUser = jest.fn<(userId: string) => Promise<{ id: string } | null>>();
  const workspacesRepository = { findPersonalWorkspaceForUser } as unknown as ConstructorParameters<typeof SocController>[1];

  const controller = new SocController(soc, workspacesRepository);
  return { controller, dashboard, findPersonalWorkspaceForUser };
}

describe('SocController.dashboard — workspace resolution is always server-side', () => {
  it('resolves workspaceId from the authenticated user, never from client input, and passes that to SocService', async () => {
    const { controller, dashboard, findPersonalWorkspaceForUser } = buildController();
    findPersonalWorkspaceForUser.mockResolvedValue({ id: 'ws-belongs-to-this-user' });
    dashboard.mockResolvedValue({ workspaceId: 'ws-belongs-to-this-user' });

    await controller.dashboard({ id: 'user-1' } as never, { windowDays: 30 } as never);

    expect(findPersonalWorkspaceForUser).toHaveBeenCalledWith('user-1');
    expect(dashboard).toHaveBeenCalledWith('ws-belongs-to-this-user', 30);
  });

  it('throws WORKSPACE_NOT_FOUND (never falls back to any other workspace) when the caller has no personal workspace', async () => {
    const { controller, dashboard, findPersonalWorkspaceForUser } = buildController();
    findPersonalWorkspaceForUser.mockResolvedValue(null);

    await expect(controller.dashboard({ id: 'user-without-workspace' } as never, { windowDays: 30 } as never)).rejects.toMatchObject({
      code: 'WORKSPACE_NOT_FOUND',
    });
    expect(dashboard).not.toHaveBeenCalled();
  });
});
