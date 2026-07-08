import { describe, expect, it, jest } from '@jest/globals';
import { SearchHandler, SearchQuery } from './search.query.js';
import type { WorkspacesRepository } from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import type { SearchService } from '../domain/search-service.interface.js';
import type { Workspace } from '../../../prisma-types.js';

describe('SearchHandler', () => {
  it('returns an empty array without querying anything for a blank query', async () => {
    const workspacesRepository = {
      findPersonalWorkspaceForUser:
        jest.fn<WorkspacesRepository['findPersonalWorkspaceForUser']>(),
    } as unknown as jest.Mocked<WorkspacesRepository>;
    const searchService = {
      search: jest.fn<SearchService['search']>(),
    } as unknown as jest.Mocked<SearchService>;
    const handler = new SearchHandler(workspacesRepository, searchService);

    const result = await handler.execute(new SearchQuery('user-1', '   '));

    expect(result).toEqual([]);
    expect(
      workspacesRepository.findPersonalWorkspaceForUser,
    ).not.toHaveBeenCalled();
  });

  it('scopes the search to the caller workspace and trims the query', async () => {
    const workspace = { id: 'ws-1' } as Workspace;
    const workspacesRepository = {
      findPersonalWorkspaceForUser: jest
        .fn<WorkspacesRepository['findPersonalWorkspaceForUser']>()
        .mockResolvedValue(workspace),
    } as unknown as jest.Mocked<WorkspacesRepository>;
    const searchService = {
      search: jest.fn<SearchService['search']>().mockResolvedValue([]),
    } as unknown as jest.Mocked<SearchService>;
    const handler = new SearchHandler(workspacesRepository, searchService);

    await handler.execute(new SearchQuery('user-1', '  acme  '));

    expect(searchService.search).toHaveBeenCalledWith('ws-1', 'acme');
  });
});
