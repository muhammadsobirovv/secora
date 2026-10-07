import { describe, expect, it, jest } from '@jest/globals';
import { EventBus } from '@nestjs/cqrs';
import {
  CreateTargetHandler,
  CreateTargetCommand,
} from './create-target.command.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  PROJECTS_REPOSITORY,
  type ProjectsRepository,
  type ProjectWithTags,
} from '../../projects/domain/repositories/projects.repository.interface.js';
import {
  TARGETS_REPOSITORY,
  type TargetsRepository,
  type TargetWithTags,
} from '../domain/repositories/targets.repository.interface.js';
import type { Target, Workspace } from '../../../prisma-types.js';
import { TargetAuthorizationService } from '../../target-authorization/target-authorization.service.js';
import { compileTransactionalTestingModule } from '../../../test-utils/transactional-testing-module.js';

// CreateTargetHandler.execute is @Transactional() (a target created with
// an authorization attestation must never exist without it), so the
// handler is built through a real Nest module with the CLS transactional
// plugin rather than with a bare `new`.
async function buildHandler() {
  const workspace = { id: 'ws-1' } as Workspace;
  const project = {
    id: 'proj-1',
    workspaceId: 'ws-1',
    tags: [],
  } as unknown as ProjectWithTags;
  const target = {
    id: 'target-1',
    projectId: 'proj-1',
    type: 'DOMAIN',
    value: 'x.com',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Target;
  const targetWithTags = { ...target, tags: [] } as TargetWithTags;

  const workspacesRepository = {
    findPersonalWorkspaceForUser: jest
      .fn<WorkspacesRepository['findPersonalWorkspaceForUser']>()
      .mockResolvedValue(workspace),
  } as unknown as jest.Mocked<WorkspacesRepository>;
  const projectsRepository = {
    findByIdForWorkspace: jest
      .fn<ProjectsRepository['findByIdForWorkspace']>()
      .mockResolvedValue(project),
  } as unknown as jest.Mocked<ProjectsRepository>;
  const targetsRepository = {
    create: jest.fn<TargetsRepository['create']>().mockResolvedValue(target),
    findById: jest
      .fn<TargetsRepository['findById']>()
      .mockResolvedValue(targetWithTags),
  } as unknown as jest.Mocked<TargetsRepository>;
  const eventBus = { publish: jest.fn() } as unknown as jest.Mocked<EventBus>;
  const targetAuthorization = {
    attestTarget: jest.fn(() => Promise.resolve({ id: 'authz-1' })),
  } as unknown as jest.Mocked<TargetAuthorizationService>;

  const moduleRef = await compileTransactionalTestingModule([
    CreateTargetHandler,
    { provide: WORKSPACES_REPOSITORY, useValue: workspacesRepository },
    { provide: PROJECTS_REPOSITORY, useValue: projectsRepository },
    { provide: TARGETS_REPOSITORY, useValue: targetsRepository },
    { provide: EventBus, useValue: eventBus },
    { provide: TargetAuthorizationService, useValue: targetAuthorization },
  ]);

  return {
    handler: moduleRef.get(CreateTargetHandler),
    targetsRepository,
    eventBus,
    targetAuthorization,
  };
}

describe('CreateTargetHandler', () => {
  it('creates a target scoped to the project and publishes TargetCreatedEvent', async () => {
    const { handler, targetsRepository, eventBus, targetAuthorization } =
      await buildHandler();

    const result = await handler.execute(
      new CreateTargetCommand('user-1', 'proj-1', {
        type: 'DOMAIN',
        value: 'x.com',
      }),
    );

    expect(targetsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'proj-1',
        type: 'DOMAIN',
        value: 'x.com',
      }),
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ verb: 'target.created', projectId: 'proj-1' }),
    );
    expect(targetAuthorization.attestTarget).not.toHaveBeenCalled();
    expect(result.id).toBe('target-1');
  });

  it('records the authorization attestation sent with the target, with the caller context', async () => {
    const { handler, targetAuthorization } = await buildHandler();

    await handler.execute(
      new CreateTargetCommand(
        'user-1',
        'proj-1',
        {
          type: 'DOMAIN',
          value: 'x.com',
          authorization: { basis: 'OWNER', attested: true },
        },
        { ipAddress: '203.0.113.5', userAgent: 'jest' },
      ),
    );

    expect(targetAuthorization.attestTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        workspaceId: 'ws-1',
        data: { basis: 'OWNER', attested: true },
        context: { ipAddress: '203.0.113.5', userAgent: 'jest' },
      }),
    );
  });
});
