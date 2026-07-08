import { describe, expect, it, jest } from '@jest/globals';
import { CreateTagHandler, CreateTagCommand } from './tag.commands.js';
import type { WorkspacesRepository } from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import type { TagsRepository } from '../domain/repositories/tags.repository.interface.js';
import type { Tag, Workspace } from '../../../prisma-types.js';

describe('CreateTagHandler', () => {
  it('rejects a duplicate tag name within the same workspace', async () => {
    const workspace = { id: 'ws-1' } as Workspace;
    const existing = {
      id: 'tag-1',
      workspaceId: 'ws-1',
      name: 'critical',
    } as Tag;

    const workspacesRepository = {
      findPersonalWorkspaceForUser: jest
        .fn<WorkspacesRepository['findPersonalWorkspaceForUser']>()
        .mockResolvedValue(workspace),
    } as unknown as jest.Mocked<WorkspacesRepository>;
    const tagsRepository = {
      findByWorkspaceAndName: jest
        .fn<TagsRepository['findByWorkspaceAndName']>()
        .mockResolvedValue(existing),
      create: jest.fn<TagsRepository['create']>(),
    } as unknown as jest.Mocked<TagsRepository>;

    const handler = new CreateTagHandler(workspacesRepository, tagsRepository);

    await expect(
      handler.execute(new CreateTagCommand('user-1', { name: 'critical' })),
    ).rejects.toMatchObject({ code: 'TAG_ALREADY_EXISTS' });
    expect(tagsRepository.create).not.toHaveBeenCalled();
  });

  it('creates the tag when the name is unique in the workspace', async () => {
    const workspace = { id: 'ws-1' } as Workspace;
    const created = {
      id: 'tag-2',
      workspaceId: 'ws-1',
      name: 'low-priority',
      color: null,
      createdAt: new Date(),
    } as Tag;

    const workspacesRepository = {
      findPersonalWorkspaceForUser: jest
        .fn<WorkspacesRepository['findPersonalWorkspaceForUser']>()
        .mockResolvedValue(workspace),
    } as unknown as jest.Mocked<WorkspacesRepository>;
    const tagsRepository = {
      findByWorkspaceAndName: jest
        .fn<TagsRepository['findByWorkspaceAndName']>()
        .mockResolvedValue(null),
      create: jest.fn<TagsRepository['create']>().mockResolvedValue(created),
    } as unknown as jest.Mocked<TagsRepository>;

    const handler = new CreateTagHandler(workspacesRepository, tagsRepository);
    const result = await handler.execute(
      new CreateTagCommand('user-1', { name: 'low-priority' }),
    );

    expect(result.name).toBe('low-priority');
  });
});
