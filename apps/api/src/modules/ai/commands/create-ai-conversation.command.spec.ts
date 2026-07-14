import { describe, expect, it, jest } from '@jest/globals';
import type { AiConversationRecord } from '../domain/repositories/ai-conversations.repository.interface.js';
import type { AiConversationsRepository } from '../domain/repositories/ai-conversations.repository.interface.js';
import type { AiContextService } from '../context/ai-context.service.js';
import {
  CreateAiConversationCommand,
  CreateAiConversationHandler,
} from './create-ai-conversation.command.js';

function record(
  overrides: Partial<AiConversationRecord> = {},
): AiConversationRecord {
  return {
    id: 'conv-1',
    workspaceId: 'ws-1',
    projectId: 'proj-1',
    userId: 'user-1',
    title: null,
    provider: null,
    model: null,
    pinned: false,
    archivedAt: null,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    ...overrides,
  };
}

function buildDeps() {
  const conversationsRepository = {
    create: jest.fn<AiConversationsRepository['create']>(),
    findById: jest.fn<AiConversationsRepository['findById']>(),
    list: jest.fn<AiConversationsRepository['list']>(),
    setPinned: jest.fn<AiConversationsRepository['setPinned']>(),
    setArchived: jest.fn<AiConversationsRepository['setArchived']>(),
    touch: jest.fn<AiConversationsRepository['touch']>(),
    delete: jest.fn<AiConversationsRepository['delete']>(),
  } as unknown as jest.Mocked<AiConversationsRepository>;

  const contextService = {
    resolveWorkspaceAndProject:
      jest.fn<AiContextService['resolveWorkspaceAndProject']>(),
  } as unknown as jest.Mocked<AiContextService>;

  return { conversationsRepository, contextService };
}

describe('CreateAiConversationHandler', () => {
  it('resolves the caller workspace/project, then creates and returns the conversation', async () => {
    const { conversationsRepository, contextService } = buildDeps();
    contextService.resolveWorkspaceAndProject.mockResolvedValue({
      workspaceId: 'ws-1',
      projectId: 'proj-1',
    });
    conversationsRepository.create.mockResolvedValue(
      record({ title: 'New chat' }),
    );

    const handler = new CreateAiConversationHandler(
      conversationsRepository,
      contextService,
    );
    const result = await handler.execute(
      new CreateAiConversationCommand(
        'user-1',
        'proj-1',
        'New chat',
        'OPENAI',
        'gpt-4o',
      ),
    );

    expect(contextService.resolveWorkspaceAndProject).toHaveBeenCalledWith(
      'user-1',
      'proj-1',
    );
    expect(conversationsRepository.create).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      userId: 'user-1',
      title: 'New chat',
      provider: 'OPENAI',
      model: 'gpt-4o',
    });
    expect(result).toMatchObject({
      id: 'conv-1',
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      title: 'New chat',
      messageCount: 0,
      lastMessagePreview: null,
    });
  });

  it('propagates a not-found error when the project does not belong to the caller workspace', async () => {
    const { conversationsRepository, contextService } = buildDeps();
    contextService.resolveWorkspaceAndProject.mockRejectedValue(
      Object.assign(new Error('Project not found in this workspace.'), {
        code: 'PROJECT_NOT_FOUND',
      }),
    );

    const handler = new CreateAiConversationHandler(
      conversationsRepository,
      contextService,
    );

    await expect(
      handler.execute(
        new CreateAiConversationCommand('user-1', 'other-project'),
      ),
    ).rejects.toMatchObject({
      code: 'PROJECT_NOT_FOUND',
    });
    expect(conversationsRepository.create).not.toHaveBeenCalled();
  });
});
