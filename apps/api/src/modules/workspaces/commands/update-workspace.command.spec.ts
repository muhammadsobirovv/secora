import { describe, expect, it, jest } from '@jest/globals';
import { EventBus } from '@nestjs/cqrs';
import {
  UpdateWorkspaceHandler,
  UpdateWorkspaceCommand,
} from './update-workspace.command.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import type { WorkspacesRepository } from '../domain/repositories/workspaces.repository.interface.js';
import type { Workspace } from '../../../prisma-types.js';

describe('UpdateWorkspaceHandler', () => {
  it('updates the caller personal workspace and publishes WorkspaceUpdatedEvent', async () => {
    const workspace = {
      id: 'ws-1',
      name: 'Old',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Workspace;
    const updated = { ...workspace, name: 'New' };
    const workspacesRepository = {
      findPersonalWorkspaceForUser: jest
        .fn<WorkspacesRepository['findPersonalWorkspaceForUser']>()
        .mockResolvedValue(workspace),
      update: jest
        .fn<WorkspacesRepository['update']>()
        .mockResolvedValue(updated),
    } as unknown as jest.Mocked<WorkspacesRepository>;
    const eventBus = { publish: jest.fn() } as unknown as jest.Mocked<EventBus>;
    const handler = new UpdateWorkspaceHandler(workspacesRepository, eventBus);

    const result = await handler.execute(
      new UpdateWorkspaceCommand('user-1', { name: 'New' }),
    );

    expect(workspacesRepository.update).toHaveBeenCalledWith('ws-1', {
      name: 'New',
    });
    expect(result.name).toBe('New');
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ verb: 'workspace.updated' }),
    );
  });

  it('throws AppException when the caller has no workspace yet', async () => {
    const workspacesRepository = {
      findPersonalWorkspaceForUser: jest
        .fn<WorkspacesRepository['findPersonalWorkspaceForUser']>()
        .mockResolvedValue(null),
    } as unknown as jest.Mocked<WorkspacesRepository>;
    const eventBus = { publish: jest.fn() } as unknown as jest.Mocked<EventBus>;
    const handler = new UpdateWorkspaceHandler(workspacesRepository, eventBus);

    await expect(
      handler.execute(new UpdateWorkspaceCommand('user-1', { name: 'New' })),
    ).rejects.toBeInstanceOf(AppException);
  });
});
