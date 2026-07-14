import { describe, expect, it, jest } from '@jest/globals';
import type { AiMemoryService } from '../memory/ai-memory.service.js';
import type { WorkspacesRepository } from '../ai-authorization.util.js';
import {
  SearchAiMemoryHandler,
  SearchAiMemoryQuery,
} from './search-ai-memory.query.js';

function buildDeps() {
  const memoryService = {
    search: jest.fn<AiMemoryService['search']>(),
  } as unknown as jest.Mocked<AiMemoryService>;
  const workspacesRepository = {
    findPersonalWorkspaceForUser:
      jest.fn<WorkspacesRepository['findPersonalWorkspaceForUser']>(),
  } as unknown as jest.Mocked<WorkspacesRepository>;
  return { memoryService, workspacesRepository };
}

describe('SearchAiMemoryHandler', () => {
  it('resolves the caller workspace and scopes the memory search to it', async () => {
    const { memoryService, workspacesRepository } = buildDeps();
    workspacesRepository.findPersonalWorkspaceForUser.mockResolvedValue({
      id: 'ws-1',
    } as Awaited<
      ReturnType<WorkspacesRepository['findPersonalWorkspaceForUser']>
    >);
    memoryService.search.mockResolvedValue([
      {
        id: 'chunk-1',
        content: 'SQLi in /login',
        sourceType: 'FINDING',
        sourceId: 'f-1',
        score: 0.92,
      },
    ]);

    const handler = new SearchAiMemoryHandler(
      memoryService,
      workspacesRepository,
    );
    const result = await handler.execute(
      new SearchAiMemoryQuery('user-1', 'sql injection', 'proj-1', 'FINDING'),
    );

    expect(
      workspacesRepository.findPersonalWorkspaceForUser,
    ).toHaveBeenCalledWith('user-1');
    expect(memoryService.search).toHaveBeenCalledWith('ws-1', 'sql injection', {
      projectId: 'proj-1',
      sourceType: 'FINDING',
    });
    expect(result).toHaveLength(1);
  });

  it('throws WORKSPACE_NOT_FOUND rather than searching when the caller has no workspace', async () => {
    const { memoryService, workspacesRepository } = buildDeps();
    workspacesRepository.findPersonalWorkspaceForUser.mockResolvedValue(null);

    const handler = new SearchAiMemoryHandler(
      memoryService,
      workspacesRepository,
    );

    await expect(
      handler.execute(new SearchAiMemoryQuery('ghost-user', 'anything')),
    ).rejects.toMatchObject({
      code: 'WORKSPACE_NOT_FOUND',
    });
    expect(memoryService.search).not.toHaveBeenCalled();
  });
});
