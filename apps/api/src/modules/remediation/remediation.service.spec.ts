import { describe, expect, it, jest } from '@jest/globals';
import { RemediationService } from './remediation.service.js';

/// Module 17 — task #488 (Multi-tenant security tests). Same
/// enumeration-safe-404 pattern as `incidents.service.spec.ts` applied
/// to `RemediationService.getForWorkspace`/`requireOwnedRow`.

function taskRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    workspaceId: 'ws-mine',
    projectId: 'project-1',
    findingId: null,
    incidentId: null,
    assetNodeType: null,
    assetRefId: null,
    owner: 'analyst-1',
    team: null,
    priority: 'HIGH',
    dueDate: null,
    status: 'OPEN',
    notes: 'Patch the vulnerable dependency.',
    createdBy: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    closedAt: null,
    ...overrides,
  };
}

function buildService() {
  const findUnique = jest.fn<(args: unknown) => Promise<unknown>>();
  const prisma = {
    remediationTask: { findUnique },
  } as unknown as ConstructorParameters<typeof RemediationService>[0];

  const service = new RemediationService(
    prisma,
    {} as ConstructorParameters<typeof RemediationService>[1],
    {} as ConstructorParameters<typeof RemediationService>[2],
  );
  return { service, findUnique };
}

describe('RemediationService.getForWorkspace (workspace isolation)', () => {
  it('returns the task when it belongs to the caller workspace', async () => {
    const { service, findUnique } = buildService();
    findUnique.mockResolvedValue(taskRow({ workspaceId: 'ws-mine' }));

    const result = await service.getForWorkspace('task-1', 'ws-mine');
    expect(result.id).toBe('task-1');
  });

  it('throws REMEDIATION_TASK_NOT_FOUND when the task belongs to a different workspace', async () => {
    const { service, findUnique } = buildService();
    findUnique.mockResolvedValue(taskRow({ workspaceId: 'ws-someone-elses' }));

    await expect(service.getForWorkspace('task-1', 'ws-mine')).rejects.toMatchObject({
      code: 'REMEDIATION_TASK_NOT_FOUND',
    });
  });

  it('throws the identical REMEDIATION_TASK_NOT_FOUND when the task simply does not exist', async () => {
    const { service, findUnique } = buildService();
    findUnique.mockResolvedValue(null);

    await expect(service.getForWorkspace('task-missing', 'ws-mine')).rejects.toMatchObject({
      code: 'REMEDIATION_TASK_NOT_FOUND',
    });
  });
});

describe('RemediationService.setStatus (workspace isolation)', () => {
  it('throws REMEDIATION_TASK_NOT_FOUND rather than closing a cross-workspace task', async () => {
    const { service, findUnique } = buildService();
    findUnique.mockResolvedValue(taskRow({ workspaceId: 'ws-someone-elses', status: 'OPEN' }));

    await expect(service.setStatus('task-1', 'ws-mine', 'user-1', 'CLOSED')).rejects.toMatchObject({
      code: 'REMEDIATION_TASK_NOT_FOUND',
    });
  });
});
