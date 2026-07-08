import { describe, expect, it, jest } from '@jest/globals';
import { EventBus } from '@nestjs/cqrs';
import {
  CreateProjectHandler,
  CreateProjectCommand,
} from './create-project.command.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import type { WorkspacesRepository } from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import type {
  ProjectsRepository,
  ProjectWithTags,
} from '../domain/repositories/projects.repository.interface.js';
import type { Project, Workspace } from '../../../prisma-types.js';

describe('CreateProjectHandler', () => {
  const workspace = { id: 'ws-1' } as Workspace;
  const project = {
    id: 'proj-1',
    workspaceId: 'ws-1',
    name: 'Acme',
    description: null,
    status: 'ACTIVE',
    visibility: 'WORKSPACE',
    createdBy: 'user-1',
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Project;
  const projectWithTags = { ...project, tags: [] } as ProjectWithTags;

  function build() {
    const workspacesRepository = {
      findPersonalWorkspaceForUser:
        jest.fn<WorkspacesRepository['findPersonalWorkspaceForUser']>(),
    } as unknown as jest.Mocked<WorkspacesRepository>;
    const projectsRepository = {
      create: jest.fn<ProjectsRepository['create']>(),
      findById: jest.fn<ProjectsRepository['findById']>(),
    } as unknown as jest.Mocked<ProjectsRepository>;
    const eventBus = { publish: jest.fn() } as unknown as jest.Mocked<EventBus>;
    return {
      handler: new CreateProjectHandler(
        workspacesRepository,
        projectsRepository,
        eventBus,
      ),
      workspacesRepository,
      projectsRepository,
      eventBus,
    };
  }

  it('creates the project in the caller workspace and publishes ProjectCreatedEvent', async () => {
    const { handler, workspacesRepository, projectsRepository, eventBus } =
      build();
    workspacesRepository.findPersonalWorkspaceForUser.mockResolvedValue(
      workspace,
    );
    projectsRepository.create.mockResolvedValue(project);
    projectsRepository.findById.mockResolvedValue(projectWithTags);

    const result = await handler.execute(
      new CreateProjectCommand('user-1', {
        name: 'Acme',
        description: undefined,
      }),
    );

    expect(projectsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        name: 'Acme',
        createdBy: 'user-1',
      }),
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        verb: 'project.created',
        workspaceId: 'ws-1',
        entityId: 'proj-1',
      }),
    );
    expect(result.isFavorite).toBe(false);
    expect(result.id).toBe('proj-1');
  });

  it('throws WORKSPACE_NOT_FOUND when the caller has no workspace', async () => {
    const { handler, workspacesRepository } = build();
    workspacesRepository.findPersonalWorkspaceForUser.mockResolvedValue(null);

    await expect(
      handler.execute(new CreateProjectCommand('user-1', { name: 'Acme' })),
    ).rejects.toThrow(AppException);
  });
});
