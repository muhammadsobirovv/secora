import { describe, expect, it, jest } from '@jest/globals';
import { EventBus } from '@nestjs/cqrs';
import {
  BulkUpdateVulnFindingsCommand,
  BulkUpdateVulnFindingsHandler,
} from './bulk-update-vuln-findings.command.js';
import type { WorkspacesRepository } from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import type { VulnFindingsRepository } from '../domain/repositories/vuln-findings.repository.interface.js';
import type { VulnFinding, Workspace } from '../../../prisma-types.js';

function finding(overrides: Partial<VulnFinding> = {}) {
  return {
    id: 'f-1',
    workspaceId: 'ws-1',
    projectId: 'proj-1',
    status: 'NEW',
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as VulnFinding;
}

function buildHandler(updated: VulnFinding[]) {
  const workspace = { id: 'ws-1' } as Workspace;
  const workspacesRepository = {
    findPersonalWorkspaceForUser: jest
      .fn<WorkspacesRepository['findPersonalWorkspaceForUser']>()
      .mockResolvedValue(workspace),
  } as unknown as jest.Mocked<WorkspacesRepository>;
  const vulnFindingsRepository = {
    bulkUpdateStatus: jest
      .fn<VulnFindingsRepository['bulkUpdateStatus']>()
      .mockResolvedValue(updated),
  } as unknown as jest.Mocked<VulnFindingsRepository>;
  const eventBus = { publish: jest.fn() } as unknown as jest.Mocked<EventBus>;

  return {
    handler: new BulkUpdateVulnFindingsHandler(
      workspacesRepository,
      vulnFindingsRepository,
      eventBus,
    ),
    eventBus,
    vulnFindingsRepository,
  };
}

describe('BulkUpdateVulnFindingsHandler', () => {
  it('scopes the update to the caller workspace and publishes one FindingUpdated per finding', async () => {
    const updated = [
      finding({ id: 'f-1', status: 'DUPLICATE' }),
      finding({ id: 'f-2', status: 'DUPLICATE' }),
    ];
    const { handler, eventBus, vulnFindingsRepository } = buildHandler(updated);

    const result = await handler.execute(
      new BulkUpdateVulnFindingsCommand('user-1', {
        findingIds: ['f-1', 'f-2'],
        status: 'DUPLICATE',
      }),
    );

    expect(vulnFindingsRepository.bulkUpdateStatus).toHaveBeenCalledWith(
      ['f-1', 'f-2'],
      'ws-1',
      'DUPLICATE',
    );
    expect(result).toHaveLength(2);
    const verbs = eventBus.publish.mock.calls.map(
      (c) => (c[0] as { verb: string }).verb,
    );
    expect(verbs).toEqual(['vuln_finding.updated', 'vuln_finding.updated']);
  });

  it('additionally publishes FindingConfirmed per finding when bulk status is CONFIRMED', async () => {
    const updated = [finding({ id: 'f-1', status: 'CONFIRMED' })];
    const { handler, eventBus } = buildHandler(updated);

    await handler.execute(
      new BulkUpdateVulnFindingsCommand('user-1', {
        findingIds: ['f-1'],
        status: 'CONFIRMED',
      }),
    );

    const verbs = eventBus.publish.mock.calls.map(
      (c) => (c[0] as { verb: string }).verb,
    );
    expect(verbs).toEqual(['vuln_finding.updated', 'vuln_finding.confirmed']);
  });

  it.each(['FIXED', 'FALSE_POSITIVE', 'ACCEPTED_RISK'] as const)(
    'additionally publishes FindingResolved per finding when bulk status is %s',
    async (status) => {
      const updated = [finding({ id: 'f-1', status })];
      const { handler, eventBus } = buildHandler(updated);

      await handler.execute(
        new BulkUpdateVulnFindingsCommand('user-1', {
          findingIds: ['f-1'],
          status,
        }),
      );

      const verbs = eventBus.publish.mock.calls.map(
        (c) => (c[0] as { verb: string }).verb,
      );
      expect(verbs).toEqual(['vuln_finding.updated', 'vuln_finding.resolved']);
    },
  );

  it('only touches findings the repository actually matched (e.g. IDs outside the caller workspace are silently skipped)', async () => {
    // bulkUpdateStatus is itself workspace-scoped (findingIds AND
    // workspaceId in the WHERE clause) — an ID belonging to another
    // workspace just doesn't come back in `updated`, so this handler
    // never publishes an event for it. No exception either: bulk
    // operations are best-effort over "whatever you own", not
    // all-or-nothing.
    const updated = [finding({ id: 'f-1' })];
    const { handler, eventBus } = buildHandler(updated);

    const result = await handler.execute(
      new BulkUpdateVulnFindingsCommand('user-1', {
        findingIds: ['f-1', 'someone-elses-finding'],
        status: 'DUPLICATE',
      }),
    );

    expect(result).toHaveLength(1);
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
  });
});
