import { describe, expect, it, jest } from '@jest/globals';
import { IncidentsService } from './incidents.service.js';

/// Module 17 — task #488 (Multi-tenant security tests). Same
/// enumeration-safe-404 workspace-isolation pattern as
/// `agent-authorization.util.spec.ts` (Module 11) applied to
/// `IncidentsService.getForWorkspace`/`requireOwnedRow` — a caller must
/// not be able to distinguish "this incident belongs to another
/// workspace" from "this incident does not exist," and must never
/// receive another workspace's incident data.
///
/// `IncidentsService` reads/writes through `this.prisma` via a direct
/// cast (`incidentTable`/`timelineTable`/`linkTables` getters — see the
/// service's own doc comment on why: the sandbox's generated
/// `@prisma/client` predates these Module 17 models). Mocking follows
/// the same "hand-rolled Prisma mock, no live DB" idiom
/// `access-share-link.command.spec.ts` (Module 16) established.

function incidentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'incident-1',
    workspaceId: 'ws-mine',
    projectId: 'project-1',
    title: 'Suspicious login activity',
    description: 'Multiple failed logins from a new ASN.',
    severity: 'HIGH',
    status: 'OPEN',
    severityFactors: null,
    reporterId: 'user-1',
    assigneeId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    resolvedAt: null,
    closedAt: null,
    ...overrides,
  };
}

function buildService() {
  const findUnique = jest.fn<(args: unknown) => Promise<unknown>>();
  const prisma = {
    incident: { findUnique },
  } as unknown as ConstructorParameters<typeof IncidentsService>[0];

  // `sla`/`eventBus`/`aiMemory` are unused by getForWorkspace's read
  // path — stubbed rather than fully mocked, matching this session's
  // established "only mock what the method under test actually calls"
  // convention.
  const service = new IncidentsService(
    prisma,
    {} as ConstructorParameters<typeof IncidentsService>[1],
    {} as ConstructorParameters<typeof IncidentsService>[2],
    {} as ConstructorParameters<typeof IncidentsService>[3],
  );
  return { service, findUnique };
}

describe('IncidentsService.getForWorkspace (workspace isolation)', () => {
  it('returns the incident when it belongs to the caller workspace', async () => {
    const { service, findUnique } = buildService();
    findUnique.mockResolvedValue(incidentRow({ workspaceId: 'ws-mine' }));

    const result = await service.getForWorkspace('incident-1', 'ws-mine');
    expect(result.id).toBe('incident-1');
    expect(result.workspaceId).toBe('ws-mine');
  });

  it('throws INCIDENT_NOT_FOUND when the incident belongs to a different workspace', async () => {
    const { service, findUnique } = buildService();
    findUnique.mockResolvedValue(incidentRow({ workspaceId: 'ws-someone-elses' }));

    await expect(service.getForWorkspace('incident-1', 'ws-mine')).rejects.toMatchObject({
      code: 'INCIDENT_NOT_FOUND',
    });
  });

  it('throws the identical INCIDENT_NOT_FOUND (not a different error) when the incident simply does not exist', async () => {
    const { service, findUnique } = buildService();
    findUnique.mockResolvedValue(null);

    await expect(service.getForWorkspace('incident-missing', 'ws-mine')).rejects.toMatchObject({
      code: 'INCIDENT_NOT_FOUND',
    });
  });
});

describe('IncidentsService.assign (workspace isolation via requireOwnedRow)', () => {
  it('throws INCIDENT_NOT_FOUND rather than reassigning a cross-workspace incident', async () => {
    const { service, findUnique } = buildService();
    findUnique.mockResolvedValue(incidentRow({ workspaceId: 'ws-someone-elses' }));

    await expect(service.assign('incident-1', 'ws-mine', 'user-1', 'user-2')).rejects.toMatchObject({
      code: 'INCIDENT_NOT_FOUND',
    });
  });
});
