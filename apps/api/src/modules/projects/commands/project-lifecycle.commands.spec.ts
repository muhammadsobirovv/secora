import { describe, expect, it, jest } from '@jest/globals';
import { EventBus } from '@nestjs/cqrs';
import {
  ArchiveProjectCommand,
  ArchiveProjectHandler,
  FavoriteProjectCommand,
  FavoriteProjectHandler,
  RestoreProjectCommand,
  RestoreProjectHandler,
} from './project-lifecycle.commands.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import type { WorkspacesRepository } from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import type { ProjectFavoritesRepository } from '../domain/repositories/project-favorites.repository.interface.js';
import type {
  ProjectsRepository,
  ProjectWithTags,
} from '../domain/repositories/projects.repository.interface.js';
import type { Project, Workspace } from '../../../prisma-types.js';

describe('Project lifecycle commands', () => {
  const workspace = { id: 'ws-1' } as Workspace;
  const project = {
    id: 'proj-1',
    workspaceId: 'ws-1',
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Project;
  const projectWithTags = { ...project, tags: [] } as ProjectWithTags;

  function repos() {
    const workspacesRepository = {
      findPersonalWorkspaceForUser:
        jest.fn<WorkspacesRepository['findPersonalWorkspaceForUser']>(),
    } as unknown as jest.Mocked<WorkspacesRepository>;
    const projectsRepository = {
      findByIdForWorkspace:
        jest.fn<ProjectsRepository['findByIdForWorkspace']>(),
      findByIdIncludingDeleted:
        jest.fn<ProjectsRepository['findByIdIncludingDeleted']>(),
      findById: jest.fn<ProjectsRepository['findById']>(),
      archive: jest.fn<ProjectsRepository['archive']>(),
      restore: jest.fn<ProjectsRepository['restore']>(),
    } as unknown as jest.Mocked<ProjectsRepository>;
    const favoritesRepository = {
      add: jest.fn<ProjectFavoritesRepository['add']>(),
      remove: jest.fn<ProjectFavoritesRepository['remove']>(),
      isFavorite: jest.fn<ProjectFavoritesRepository['isFavorite']>(),
    } as unknown as jest.Mocked<ProjectFavoritesRepository>;
    const eventBus = { publish: jest.fn() } as unknown as jest.Mocked<EventBus>;
    return {
      workspacesRepository,
      projectsRepository,
      favoritesRepository,
      eventBus,
    };
  }

  it('ArchiveProjectHandler sets status to ARCHIVED and publishes an event', async () => {
    const {
      workspacesRepository,
      projectsRepository,
      favoritesRepository,
      eventBus,
    } = repos();
    workspacesRepository.findPersonalWorkspaceForUser.mockResolvedValue(
      workspace,
    );
    projectsRepository.findByIdForWorkspace.mockResolvedValue(projectWithTags);
    projectsRepository.archive.mockResolvedValue({
      ...project,
      status: 'ARCHIVED',
    });
    projectsRepository.findById.mockResolvedValue({
      ...projectWithTags,
      status: 'ARCHIVED',
    });
    favoritesRepository.isFavorite.mockResolvedValue(false);
    const handler = new ArchiveProjectHandler(
      workspacesRepository,
      projectsRepository,
      favoritesRepository,
      eventBus,
    );

    const result = await handler.execute(
      new ArchiveProjectCommand('user-1', 'proj-1'),
    );

    expect(projectsRepository.archive).toHaveBeenCalledWith('proj-1');
    expect(result.status).toBe('ARCHIVED');
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ verb: 'project.archived' }),
    );
  });

  it('RestoreProjectHandler looks up including soft-deleted rows and clears deletedAt', async () => {
    const {
      workspacesRepository,
      projectsRepository,
      favoritesRepository,
      eventBus,
    } = repos();
    workspacesRepository.findPersonalWorkspaceForUser.mockResolvedValue(
      workspace,
    );
    projectsRepository.findByIdIncludingDeleted.mockResolvedValue({
      ...project,
      deletedAt: new Date(),
    });
    projectsRepository.restore.mockResolvedValue(project);
    projectsRepository.findById.mockResolvedValue(projectWithTags);
    favoritesRepository.isFavorite.mockResolvedValue(false);
    const handler = new RestoreProjectHandler(
      workspacesRepository,
      projectsRepository,
      favoritesRepository,
      eventBus,
    );

    await handler.execute(new RestoreProjectCommand('user-1', 'proj-1'));

    expect(projectsRepository.findByIdIncludingDeleted).toHaveBeenCalledWith(
      'proj-1',
    );
    expect(projectsRepository.restore).toHaveBeenCalledWith('proj-1');
  });

  it('RestoreProjectHandler rejects a project belonging to a different workspace (enumeration-safe 404)', async () => {
    const {
      workspacesRepository,
      projectsRepository,
      favoritesRepository,
      eventBus,
    } = repos();
    workspacesRepository.findPersonalWorkspaceForUser.mockResolvedValue(
      workspace,
    );
    projectsRepository.findByIdIncludingDeleted.mockResolvedValue({
      ...project,
      workspaceId: 'someone-elses-ws',
    });
    const handler = new RestoreProjectHandler(
      workspacesRepository,
      projectsRepository,
      favoritesRepository,
      eventBus,
    );

    await expect(
      handler.execute(new RestoreProjectCommand('user-1', 'proj-1')),
    ).rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND' });
  });

  it('FavoriteProjectHandler is idempotent (favoriting twice does not error)', async () => {
    const {
      workspacesRepository,
      projectsRepository,
      favoritesRepository,
      eventBus,
    } = repos();
    workspacesRepository.findPersonalWorkspaceForUser.mockResolvedValue(
      workspace,
    );
    projectsRepository.findByIdForWorkspace.mockResolvedValue(projectWithTags);
    projectsRepository.findById.mockResolvedValue(projectWithTags);
    const handler = new FavoriteProjectHandler(
      workspacesRepository,
      projectsRepository,
      favoritesRepository,
      eventBus,
    );

    await handler.execute(new FavoriteProjectCommand('user-1', 'proj-1'));
    await handler.execute(new FavoriteProjectCommand('user-1', 'proj-1'));

    expect(favoritesRepository.add).toHaveBeenCalledTimes(2);
    expect(favoritesRepository.add).toHaveBeenCalledWith('proj-1', 'user-1');
  });

  it('AppException.code carries a stable machine-readable string', async () => {
    const {
      workspacesRepository,
      projectsRepository,
      favoritesRepository,
      eventBus,
    } = repos();
    workspacesRepository.findPersonalWorkspaceForUser.mockResolvedValue(null);
    const handler = new ArchiveProjectHandler(
      workspacesRepository,
      projectsRepository,
      favoritesRepository,
      eventBus,
    );

    await expect(
      handler.execute(new ArchiveProjectCommand('user-1', 'proj-1')),
    ).rejects.toBeInstanceOf(AppException);
  });
});
