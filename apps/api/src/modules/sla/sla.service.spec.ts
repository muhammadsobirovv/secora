import { describe, expect, it, jest } from '@jest/globals';
import { SlaService } from './sla.service.js';

/// Module 17 — task #496 (Tests: SLA calc). `SlaService` has no
/// dedicated spec yet; this covers the two behaviors spec section 23
/// actually depends on being correct: (1) `resolveClock`'s breach
/// determination (`occurredAt > dueAt`) — get this backwards and every
/// SLA report in the platform silently lies — and (2) the Community
/// Edition guarantee that a workspace with no configured `SlaPolicy`
/// never gets an SLA clock started rather than erroring.
/// Hand-rolled Prisma mock, no live DB — same idiom `incidents.service.spec.ts`
/// (task #488) established.

function buildService() {
  const slaEventCreate = jest.fn<(args: unknown) => Promise<Record<string, unknown>>>();
  const slaEventFindMany = jest.fn<(args: unknown) => Promise<Record<string, unknown>[]>>();
  const slaPolicyFindFirst = jest.fn<(args: unknown) => Promise<Record<string, unknown> | null>>();
  const slaPolicyCreate = jest.fn<(args: unknown) => Promise<Record<string, unknown>>>();
  const slaPolicyUpdate = jest.fn<(args: unknown) => Promise<Record<string, unknown>>>();
  const auditCreate = jest.fn<(args: unknown) => Promise<unknown>>();

  const prisma = {
    slaEvent: { create: slaEventCreate, findMany: slaEventFindMany },
    slaPolicy: { findFirst: slaPolicyFindFirst, create: slaPolicyCreate, update: slaPolicyUpdate },
    auditEvent: { create: auditCreate },
  } as unknown as ConstructorParameters<typeof SlaService>[0];

  const eventBus = { publish: jest.fn() } as unknown as ConstructorParameters<typeof SlaService>[1];

  const service = new SlaService(prisma, eventBus);
  return { service, slaEventCreate, slaEventFindMany, slaPolicyFindFirst, slaPolicyCreate, slaPolicyUpdate, auditCreate };
}

describe('SlaService.startClock (Community Edition guarantee)', () => {
  it('does nothing when no SlaPolicy is configured for this workspace/severity', async () => {
    const { service, slaPolicyFindFirst, slaEventCreate } = buildService();
    slaPolicyFindFirst.mockResolvedValue(null); // both the workspace-scoped and org-wide fallback lookups

    await service.startClock('ws-1', 'HIGH', { incidentId: 'incident-1' });

    expect(slaEventCreate).not.toHaveBeenCalled();
  });

  it('creates a STARTED event with dueAt computed from the policy targetHours when a policy exists', async () => {
    const { service, slaPolicyFindFirst, slaEventCreate } = buildService();
    slaPolicyFindFirst.mockResolvedValueOnce({ id: 'policy-1', targetHours: 4, organizationId: null, workspaceId: 'ws-1', severity: 'HIGH' });
    slaEventCreate.mockResolvedValue({ id: 'event-1' });

    const before = Date.now();
    await service.startClock('ws-1', 'HIGH', { incidentId: 'incident-1' });
    const after = Date.now();

    expect(slaEventCreate).toHaveBeenCalledTimes(1);
    const args = slaEventCreate.mock.calls[0][0] as { data: { workspaceId: string; eventType: string; dueAt: Date; breached: boolean } };
    expect(args.data.workspaceId).toBe('ws-1');
    expect(args.data.eventType).toBe('STARTED');
    expect(args.data.breached).toBe(false);
    // dueAt should be ~4 hours (14_400_000ms) after "now", not before it and
    // not some other multiple of targetHours.
    const dueOffsetMs = args.data.dueAt.getTime() - before;
    expect(dueOffsetMs).toBeGreaterThanOrEqual(4 * 3_600_000 - (after - before));
    expect(dueOffsetMs).toBeLessThanOrEqual(4 * 3_600_000 + (after - before) + 1000);
  });
});

describe('SlaService.resolveClock (breach determination)', () => {
  it('records breached: true when resolution happens after dueAt', async () => {
    const { service, slaEventFindMany, slaEventCreate } = buildService();
    const dueAt = new Date(Date.now() - 60_000); // due 1 minute ago -> already overdue
    slaEventFindMany.mockResolvedValue([
      { id: 'started-1', workspaceId: 'ws-1', incidentId: 'incident-1', findingId: null, policyId: 'policy-1', eventType: 'STARTED', dueAt, occurredAt: null, breached: false, createdAt: new Date(Date.now() - 120_000) },
    ]);
    slaEventCreate.mockResolvedValue({ id: 'event-2' });

    await service.resolveClock('ws-1', { incidentId: 'incident-1' });

    const args = slaEventCreate.mock.calls[0][0] as { data: { eventType: string; breached: boolean } };
    expect(args.data.eventType).toBe('RESOLVED');
    expect(args.data.breached).toBe(true);
  });

  it('records breached: false when resolution happens before dueAt', async () => {
    const { service, slaEventFindMany, slaEventCreate } = buildService();
    const dueAt = new Date(Date.now() + 3_600_000); // due 1 hour from now -> still on time
    slaEventFindMany.mockResolvedValue([
      { id: 'started-1', workspaceId: 'ws-1', incidentId: 'incident-1', findingId: null, policyId: 'policy-1', eventType: 'STARTED', dueAt, occurredAt: null, breached: false, createdAt: new Date(Date.now() - 60_000) },
    ]);
    slaEventCreate.mockResolvedValue({ id: 'event-3' });

    await service.resolveClock('ws-1', { incidentId: 'incident-1' });

    const args = slaEventCreate.mock.calls[0][0] as { data: { breached: boolean } };
    expect(args.data.breached).toBe(false);
  });

  it('does nothing when there is no unresolved STARTED clock for this entity', async () => {
    const { service, slaEventFindMany, slaEventCreate } = buildService();
    slaEventFindMany.mockResolvedValue([]); // no STARTED event at all

    await service.resolveClock('ws-1', { incidentId: 'incident-1' });

    expect(slaEventCreate).not.toHaveBeenCalled();
  });

  it('does nothing when the latest STARTED clock already has a later RESOLVED counterpart', async () => {
    const { service, slaEventFindMany, slaEventCreate } = buildService();
    const startedAt = new Date(Date.now() - 120_000);
    const resolvedAt = new Date(Date.now() - 60_000);
    slaEventFindMany.mockResolvedValue([
      { id: 'resolved-1', workspaceId: 'ws-1', incidentId: 'incident-1', findingId: null, policyId: 'policy-1', eventType: 'RESOLVED', dueAt: new Date(), occurredAt: resolvedAt, breached: false, createdAt: resolvedAt },
      { id: 'started-1', workspaceId: 'ws-1', incidentId: 'incident-1', findingId: null, policyId: 'policy-1', eventType: 'STARTED', dueAt: new Date(), occurredAt: null, breached: false, createdAt: startedAt },
    ]);

    await service.resolveClock('ws-1', { incidentId: 'incident-1' });

    expect(slaEventCreate).not.toHaveBeenCalled();
  });
});

describe('SlaService.upsertPolicy — audit logging (task #499 final review fix)', () => {
  it('writes an SLA_POLICY_CHANGED audit event when creating a new policy', async () => {
    const { service, slaPolicyFindFirst, slaPolicyCreate, auditCreate } = buildService();
    slaPolicyFindFirst.mockResolvedValue(null);
    slaPolicyCreate.mockResolvedValue({ id: 'policy-new', organizationId: null, workspaceId: 'ws-1', severity: 'HIGH', targetHours: 4, createdAt: new Date() });

    await service.upsertPolicy('ws-1', 'user-1', 'HIGH', 4);

    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'user-1', type: 'SLA_POLICY_CHANGED' }) }),
    );
  });

  it('writes an SLA_POLICY_CHANGED audit event when updating an existing policy', async () => {
    const { service, slaPolicyFindFirst, slaPolicyUpdate, auditCreate } = buildService();
    slaPolicyFindFirst.mockResolvedValue({ id: 'policy-1', organizationId: null, workspaceId: 'ws-1', severity: 'HIGH', targetHours: 4, createdAt: new Date() });
    slaPolicyUpdate.mockResolvedValue({ id: 'policy-1', organizationId: null, workspaceId: 'ws-1', severity: 'HIGH', targetHours: 8, createdAt: new Date() });

    await service.upsertPolicy('ws-1', 'user-1', 'HIGH', 8);

    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-1', type: 'SLA_POLICY_CHANGED', metadata: expect.objectContaining({ previousTargetHours: 4, targetHours: 8 }) }),
      }),
    );
  });
});

describe('SlaService.listEventsForWorkspace (workspace isolation)', () => {
  it('always scopes the query by the caller workspaceId, never trusting any other source', async () => {
    const { service, slaEventFindMany } = buildService();
    slaEventFindMany.mockResolvedValue([]);

    await service.listEventsForWorkspace('ws-mine', {});

    const args = slaEventFindMany.mock.calls[0][0] as { where: { workspaceId: string } };
    expect(args.where.workspaceId).toBe('ws-mine');
  });
});
