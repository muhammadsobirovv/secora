import { describe, expect, it, jest } from '@jest/globals';
import { EventBus } from '@nestjs/cqrs';
import {
  CreateTargetHandler,
  CreateTargetCommand,
} from './create-target.command.js';
import type { WorkspacesRepository } from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import type {
  ProjectsRepository,
  ProjectWithTags,
} from '../../projects/domain/repositories/projects.repository.interface.js';
import type {
  TargetsRepository,
  TargetWithTags,
} from '../domain/repositories/targets.repository.interface.js';
import type { Target, Workspace } from '../../../prisma-types.js';

describe('CreateTargetHandler', () => {
  it('creates a target scoped to the project and publishes TargetCreatedEvent', async () => {
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

    const handler = new CreateTargetHandler(
      workspacesRepository,
      projectsRepository,
      targetsRepository,
      eventBus,
    );

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
    expect(result.id).toBe('target-1');
  });
});
