import { describe, expect, it, jest } from '@jest/globals';
import { EventBus } from '@nestjs/cqrs';
import {
  PromoteFindingToTargetCommand,
  PromoteFindingToTargetHandler,
} from './promote-finding-to-target.command.js';
import type { WorkspacesRepository } from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import type { TargetsRepository } from '../../targets/domain/repositories/targets.repository.interface.js';
import type { ReconFindingsRepository } from '../domain/repositories/recon-findings.repository.interface.js';
import type { ReconFinding, Target, Workspace } from '../../../prisma-types.js';

function baseFinding(overrides: Partial<ReconFinding> = {}): ReconFinding {
  return {
    id: 'finding-1',
    jobId: 'job-1',
    workspaceId: 'ws-1',
    projectId: 'proj-1',
    targetId: 'target-1',
    type: 'SUBDOMAIN',
    value: 'api.example.com',
    data: {},
    source: 'SUBFINDER',
    dedupKey: 'api.example.com',
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
    promotedTargetId: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('PromoteFindingToTargetHandler', () => {
  it('creates a real Target from a promotable finding, marks it promoted, and publishes both events', async () => {
    const workspace = { id: 'ws-1' } as Workspace;
    const finding = baseFinding();
    const target = {
      id: 'new-target-1',
      projectId: 'proj-1',
      type: 'SUBDOMAIN',
      value: 'api.example.com',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Target;
    const targetWithTags = { ...target, tags: [] };

    const workspacesRepository = {
      findPersonalWorkspaceForUser: jest
        .fn<WorkspacesRepository['findPersonalWorkspaceForUser']>()
        .mockResolvedValue(workspace),
    } as unknown as jest.Mocked<WorkspacesRepository>;
    const targetsRepository = {
      create: jest.fn<TargetsRepository['create']>().mockResolvedValue(target),
      findById: jest
        .fn<TargetsRepository['findById']>()
        .mockResolvedValue(targetWithTags),
    } as unknown as jest.Mocked<TargetsRepository>;
    const reconFindingsRepository = {
      findByIdForWorkspace: jest
        .fn<ReconFindingsRepository['findByIdForWorkspace']>()
        .mockResolvedValue(finding),
      markPromoted: jest.fn<ReconFindingsRepository['markPromoted']>(),
    } as unknown as jest.Mocked<ReconFindingsRepository>;
    const eventBus = { publish: jest.fn() } as unknown as jest.Mocked<EventBus>;

    const handler = new PromoteFindingToTargetHandler(
      workspacesRepository,
      targetsRepository,
      reconFindingsRepository,
      eventBus,
    );

    const result = await handler.execute(
      new PromoteFindingToTargetCommand('user-1', 'finding-1', {}),
    );

    expect(targetsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'proj-1',
        type: 'SUBDOMAIN',
        value: 'api.example.com',
        scopeStatus: 'PENDING_REVIEW',
      }),
    );
    expect(reconFindingsRepository.markPromoted).toHaveBeenCalledWith(
      'finding-1',
      'new-target-1',
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ verb: 'recon_finding.promoted' }),
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ verb: 'target.created' }),
    );
    expect(result.id).toBe('new-target-1');
  });

  it('rejects promoting a finding type that has no corresponding target type', async () => {
    const workspace = { id: 'ws-1' } as Workspace;
    const finding = baseFinding({ type: 'OPEN_PORT', value: '1.2.3.4:80' });

    const workspacesRepository = {
      findPersonalWorkspaceForUser: jest
        .fn<WorkspacesRepository['findPersonalWorkspaceForUser']>()
        .mockResolvedValue(workspace),
    } as unknown as jest.Mocked<WorkspacesRepository>;
    const targetsRepository = {
      create: jest.fn(),
    } as unknown as jest.Mocked<TargetsRepository>;
    const reconFindingsRepository = {
      findByIdForWorkspace: jest
        .fn<ReconFindingsRepository['findByIdForWorkspace']>()
        .mockResolvedValue(finding),
    } as unknown as jest.Mocked<ReconFindingsRepository>;
    const eventBus = { publish: jest.fn() } as unknown as jest.Mocked<EventBus>;

    const handler = new PromoteFindingToTargetHandler(
      workspacesRepository,
      targetsRepository,
      reconFindingsRepository,
      eventBus,
    );

    await expect(
      handler.execute(
        new PromoteFindingToTargetCommand('user-1', 'finding-1', {}),
      ),
    ).rejects.toMatchObject({ code: 'RECON_FINDING_NOT_PROMOTABLE' });
    expect(targetsRepository.create).not.toHaveBeenCalled();
  });

  it('rejects promoting a finding that was already promoted (idempotency guard)', async () => {
    const workspace = { id: 'ws-1' } as Workspace;
    const finding = baseFinding({ promotedTargetId: 'existing-target' });

    const workspacesRepository = {
      findPersonalWorkspaceForUser: jest
        .fn<WorkspacesRepository['findPersonalWorkspaceForUser']>()
        .mockResolvedValue(workspace),
    } as unknown as jest.Mocked<WorkspacesRepository>;
    const targetsRepository = {
      create: jest.fn(),
    } as unknown as jest.Mocked<TargetsRepository>;
    const reconFindingsRepository = {
      findByIdForWorkspace: jest
        .fn<ReconFindingsRepository['findByIdForWorkspace']>()
        .mockResolvedValue(finding),
    } as unknown as jest.Mocked<ReconFindingsRepository>;
    const eventBus = { publish: jest.fn() } as unknown as jest.Mocked<EventBus>;

    const handler = new PromoteFindingToTargetHandler(
      workspacesRepository,
      targetsRepository,
      reconFindingsRepository,
      eventBus,
    );

    await expect(
      handler.execute(
        new PromoteFindingToTargetCommand('user-1', 'finding-1', {}),
      ),
    ).rejects.toMatchObject({ code: 'RECON_FINDING_ALREADY_PROMOTED' });
    expect(targetsRepository.create).not.toHaveBeenCalled();
 