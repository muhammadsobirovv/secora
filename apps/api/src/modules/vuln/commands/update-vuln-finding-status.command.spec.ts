import { describe, expect, it, jest } from '@jest/globals';
import { EventBus } from '@nestjs/cqrs';
import {
  UpdateVulnFindingStatusCommand,
  UpdateVulnFindingStatusHandler,
} from './update-vuln-finding-status.command.js';
import type { WorkspacesRepository } from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import type { VulnFindingsRepository } from '../domain/repositories/vuln-findings.repository.interface.js';
import type { VulnFinding, Workspace } from '../../../prisma-types.js';

function baseFinding(overrides: Partial<VulnFinding> = {}) {
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

function buildHandler(finding: VulnFinding, updated: VulnFinding) {
  const workspace = { id: 'ws-1' } as Workspace;
  const workspacesRepository = {
    findPersonalWorkspaceForUser: jest
      .fn<WorkspacesRepository['findPersonalWorkspaceForUser']>()
      .mockResolvedValue(workspace),
  } as unknown as jest.Mocked<WorkspacesRepository>;
  const vulnFindingsRepository = {
    findByIdForWorkspace: jest
      .fn<VulnFindingsRepository['findByIdForWorkspace']>()
      .mockResolvedValue(finding),
    updateStatus: jest
      .fn<VulnFindingsRepository['updateStatus']>()
      .mockResolvedValue(updated),
  } as unknown as jest.Mocked<VulnFindingsRepository>;
  const eventBus = { publish: jest.fn() } as unknown as jest.Mocked<EventBus>;

  return {
    handler: new UpdateVulnFindingStatusHandler(
      workspacesRepository,
      vulnFindingsRepository,
      eventBus,
    ),
    eventBus,
    vulnFindingsRepository,
  };
}

describe('UpdateVulnFindingStatusHandler', () => {
  it('publishes only FindingUpdated for a plain status change', async () => {
    const { handler, eventBus } = buildHandler(
      baseFinding(),
      baseFinding({ status: 'DUPLICATE' }),
    );

    await handler.execute(
      new UpdateVulnFindingStatusCommand('user-1', 'f-1', {
        status: 'DUPLICATE',
      }),
    );

    const verbs = eventBus.publish.mock.calls.map(
      (c) => (c[0] as { verb: string }).verb,
    );
    expect(verbs).toEqual(['vuln_finding.updated']);
  });

  it('additionally publishes FindingConfirmed when the new status is CONFIRMED', async () => {
    const { handler, eventBus } = buildHandler(
      baseFinding(),
      baseFinding({ status: 'CONFIRMED' }),
    );

    await handler.execute(
      new UpdateVulnFindingStatusCommand('user-1', 'f-1', {
        status: 'CONFIRMED',
      }),
    );

    const verbs = eventBus.publish.mock.calls.map(
      (c) => (c[0] as { verb: string }).verb,
    );
    expect(verbs).toEqual(['vuln_finding.updated', 'vuln_finding.confirmed']);
  });

  it.each(['FIXED', 'FALSE_POSITIVE', 'ACCEPTED_RISK'] as const)(
    'additionally publishes FindingResolved when the new status is %s',
    async (status) => {
      const { handler, eventBus } = buildHandler(
        baseFinding(),
        baseFinding({ status }),
      );

      await handler.execute(
        new UpdateVulnFindingStatusCommand('user-1', 'f-1', { status }),
      );

      const verbs = eventBus.publish.mock.calls.map(
        (c) => (c[0] as { verb: string }).verb,
      );
      expect(verbs).toEqual(['vuln_finding.updated', 'vuln_finding.resolved']);
    },
  );

  it('rejects updating a finding that does not exist in the caller workspace', async () => {
    const workspace = { id: 'ws-1' } as Workspace;
    const workspacesRepository = {
      findPersonalWorkspaceForUser: jest
        .fn<WorkspacesRepository['findPersonalWorkspaceForUser']>()
        .mockResolvedValue(workspace),
    } as unknown as jest.Mocked<WorkspacesRepository>;
    const vulnFindingsRepository = {
      findByIdForWorkspace: jest
        .fn<VulnFindingsRepository['findByIdForWorkspace']>()
        .mockResolvedValue(null),
    } as unknown as jest.Mocked<VulnFindingsRepository>;
    const eventBus = { publish: jest.fn() } as unknown as jest.Mocked<EventBus>;
    const handler = new UpdateVulnFindingStatusHandler(
      workspacesRepository,
      vulnFindingsRepository,
      eventBus,
    );

    await expect(
      handler.execute(
        new UpdateVulnFindingStatusCommand('user-1', 'missing', {
          status: 'CONFIRMED',
        }),
      ),
    ).rejects.toMatchObject({ code: 'VULN_FINDING_NOT_FOUND' });
  });
});
