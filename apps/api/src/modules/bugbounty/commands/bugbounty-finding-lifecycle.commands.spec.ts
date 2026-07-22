import { describe, expect, it, jest } from '@jest/globals';
import { EventBus } from '@nestjs/cqrs';
import {
  TransitionBugBountyFindingStageCommand,
  TransitionBugBountyFindingStageHandler,
} from './bugbounty-finding-lifecycle.commands.js';
import type { WorkspacesRepository } from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import type { BugBountyFindingsRepository } from '../domain/repositories/bugbounty-findings.repository.interface.js';
import type { BugBountyFinding, Workspace } from '../../../prisma-types.js';

function baseFinding(
  overrides: Partial<BugBountyFinding> = {},
): BugBountyFinding {
  return {
    id: 'finding-1',
    workspaceId: 'ws-1',
    projectId: 'proj-1',
    programId: 'program-1',
    targetId: null,
    vulnFindingId: null,
    title: 'Reflected XSS',
    description: 'desc',
    severity: 'HIGH',
    cvssScore: null,
    cvssVector: null,
    cwe: null,
    vulnType: null,
    endpoint: null,
    payload: null,
    stage: 'NEW',
    duplicateOfId: null,
    bountyAmount: null,
    currency: null,
    tags: [],
    createdBy: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  } as unknown as BugBountyFinding;
}

function buildHandler(finding: BugBountyFinding, updated: BugBountyFinding) {
  const workspace = { id: 'ws-1' } as Workspace;
  const workspacesRepository = {
    findPersonalWorkspaceForUser: jest
      .fn<WorkspacesRepository['findPersonalWorkspaceForUser']>()
      .mockResolvedValue(workspace),
  } as unknown as jest.Mocked<WorkspacesRepository>;
  const findingsRepository = {
    findByIdForWorkspace: jest
      .fn<BugBountyFindingsRepository['findByIdForWorkspace']>()
      .mockResolvedValue(finding),
    transitionStage: jest
      .fn<BugBountyFindingsRepository['transitionStage']>()
      .mockResolvedValue(updated),
    listEvidenceIds: jest
      .fn<BugBountyFindingsRepository['listEvidenceIds']>()
      .mockResolvedValue([]),
  } as unknown as jest.Mocked<BugBountyFindingsRepository>;
  const eventBus = { publish: jest.fn() } as unknown as jest.Mocked<EventBus>;

  return {
    handler: new TransitionBugBountyFindingStageHandler(
      workspacesRepository,
      findingsRepository,
      eventBus,
    ),
    eventBus,
    findingsRepository,
  };
}

describe('TransitionBugBountyFindingStageHandler', () => {
  it('rejects any transition once the finding is in a terminal stage (CLOSED/ARCHIVED)', async () => {
    const { handler } = buildHandler(
      baseFinding({ stage: 'CLOSED' }),
      baseFinding({ stage: 'ARCHIVED' }),
    );

    await expect(
      handler.execute(
        new TransitionBugBountyFindingStageCommand('user-1', 'finding-1', {
          stage: 'ARCHIVED',
        }),
      ),
    ).rejects.toMatchObject({
      code: 'BUGBOUNTY_FINDING_INVALID_STAGE_TRANSITION',
    });
  });

  it('requires duplicateOfId when transitioning to DUPLICATE', async () => {
    const { handler } = buildHandler(
      baseFinding({ stage: 'TRIAGED' }),
      baseFinding({ stage: 'DUPLICATE' }),
    );

    await expect(
      handler.execute(
        new TransitionBugBountyFindingStageCommand('user-1', 'finding-1', {
          stage: 'DUPLICATE',
        }),
      ),
    ).rejects.toMatchObject({
      code: 'BUGBOUNTY_FINDING_INVALID_STAGE_TRANSITION',
    });
  });

  it('allows transitioning to DUPLICATE when duplicateOfId is provided', async () => {
    const { handler, findingsRepository } = buildHandler(
      baseFinding({ stage: 'TRIAGED' }),
      baseFinding({ stage: 'DUPLICATE', duplicateOfId: 'other-finding' }),
    );

    await handler.execute(
      new TransitionBugBountyFindingStageCommand('user-1', 'finding-1', {
        stage: 'DUPLICATE',
        duplicateOfId: 'other-finding',
      }),
    );

    expect(findingsRepository.transitionStage).toHaveBeenCalledWith(
      'finding-1',
      expect.objectContaining({
        stage: 'DUPLICATE',
        duplicateOfId: 'other-finding',
      }),
    );
  });

  it('publishes only StageChanged for a normal forward transition', async () => {
    const { handler, eventBus } = buildHandler(
      baseFinding({ stage: 'TRIAGED' }),
      baseFinding({ stage: 'VERIFIED' }),
    );

    await handler.execute(
      new TransitionBugBountyFindingStageCommand('user-1', 'finding-1', {
        stage: 'VERIFIED',
      }),
    );

    expect(eventBus.publish).toHaveBeenCalledTimes(1);
  });

  it('additionally publishes FindingReported when the new stage is REPORTED', async () => {
    const { handler, eventBus } = buildHandler(
      baseFinding({ stage: 'VERIFIED' }),
      baseFinding({ stage: 'REPORTED' }),
    );

    await handler.execute(
      new TransitionBugBountyFindingStageCommand('user-1', 'finding-1', {
        stage: 'REPORTED',
      }),
    );

    expect(eventBus.publish).toHaveBeenCalledTimes(2);
  });

  it('rejects transitioning a finding that does not belong to the caller workspace (enumeration-safe 404)', async () => {
    const workspace = { id: 'ws-1' } as Workspace;
    const workspacesRepository = {
      findPersonalWorkspaceForUser: jest
        .fn<WorkspacesRepository['findPersonalWorkspaceForUser']>()
        .mockResolvedValue(workspace),
    } as unknown as jest.Mocked<WorkspacesRepository>;
    const findingsRepository = {
      findByIdForWorkspace: jest
        .fn<BugBountyFindingsRepository['findByIdForWorkspace']>()
        .mockResolvedValue(null),
    } as unknown as jest.Mocked<BugBountyFindingsRepository>;
    const eventBus = { publish: jest.fn() } as unknown as jest.Mocked<EventBus>;
    const handler = new TransitionBugBountyFindingStageHandler(
      workspacesRepository,
      findingsRepository,
      eventBus,
    );

    await expect(
      handler.execute(
        new TransitionBugBountyFindingStageCommand('user-1', 'missing', {
          stage: 'VERIFIED',
        }),
      ),
    ).rejects.toMatchObject({ code: 'BUGBOUNTY_FINDING_NOT_FOUND' });
  });
});
