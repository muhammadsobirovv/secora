import { describe, expect, it, jest } from '@jest/globals';
import type {
  AiConversationRecord,
  AiConversationsRepository,
} from './domain/repositories/ai-conversations.repository.interface.js';
import type {
  AiMessageRecord,
  AiMessagesRepository,
} from './domain/repositories/ai-messages.repository.interface.js';
import type { WorkspacesRepository } from '../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  resolveAiConversationForCaller,
  resolveAiMessageForCaller,
} from './ai-authorization.util.js';

function conversation(
  overrides: Partial<AiConversationRecord> = {},
): AiConversationRecord {
  return {
    id: 'conv-1',
    workspaceId: 'ws-mine',
    projectId: 'proj-1',
    userId: 'user-1',
    title: null,
    provider: null,
    model: null,
    pinned: false,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function message(overrides: Partial<AiMessageRecord> = {}): AiMessageRecord {
  return {
    id: 'msg-1',
    conversationId: 'conv-1',
    role: 'USER',
    content: 'hello',
    status: 'COMPLETE',
    provider: null,
    model: null,
    promptTokens: null,
    completionTokens: null,
    bookmarked: false,
    pinned: false,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildRepos() {
  const conversationsRepository = {
    findById: jest.fn<AiConversationsRepository['findById']>(),
  } as unknown as jest.Mocked<AiConversationsRepository>;
  const messagesRepository = {
    findById: jest.fn<AiMessagesRepository['findById']>(),
  } as unknown as jest.Mocked<AiMessagesRepository>;
  const workspacesRepository = {
    findPersonalWorkspaceForUser:
      jest.fn<WorkspacesRepository['findPersonalWorkspaceForUser']>(),
  } as unknown as jest.Mocked<WorkspacesRepository>;
  return { conversationsRepository, messagesRepository, workspacesRepository };
}

const MY_WORKSPACE = { id: 'ws-mine' } as Awaited<
  ReturnType<WorkspacesRepository['findPersonalWorkspaceForUser']>
>;

describe('resolveAiConversationForCaller (workspace isolation)', () => {
  it('returns the conversation when it belongs to the caller workspace', async () => {
    const { conversationsRepository, workspacesRepository } = buildRepos();
    workspacesRepository.findPersonalWorkspaceForUser.mockResolvedValue(
      MY_WORKSPACE,
    );
    conversationsRepository.findById.mockResolvedValue(
      conversation({ workspaceId: 'ws-mine' }),
    );

    const result = await resolveAiConversationForCaller(
      conversationsRepository,
      workspacesRepository,
      'user-1',
      'conv-1',
    );
    expect(result.workspaceId).toBe('ws-mine');
  });

  it('throws AI_CONVERSATION_NOT_FOUND when the conversation belongs to a different workspace', async () => {
    const { conversationsRepository, workspacesRepository } = buildRepos();
    workspacesRepository.findPersonalWorkspaceForUser.mockResolvedValue(
      MY_WORKSPACE,
    );
    conversationsRepository.findById.mockResolvedValue(
      conversation({ workspaceId: 'ws-someone-elses' }),
    );

    await expect(
      resolveAiConversationForCaller(
        conversationsRepository,
        workspacesRepository,
        'user-1',
        'conv-1',
      ),
    ).rejects.toMatchObject({ code: 'AI_CONVERSATION_NOT_FOUND' });
  });

  it('throws the same AI_CONVERSATION_NOT_FOUND (not a different error) when the conversation simply does not exist', async () => {
    // Deliberately identical to the cross-workspace case above — a caller
    // must not be able to distinguish "doesn't exist" from "exists in
    // another workspace" (enumeration-safe 404).
    const { conversationsRepository, workspacesRepository } = buildRepos();
    workspacesRepository.findPersonalWorkspaceForUser.mockResolvedValue(
      MY_WORKSPACE,
    );
    conversationsRepository.findById.mockResolvedValue(null);

    await expect(
      resolveAiConversationForCaller(
        conversationsRepository,
        workspacesRepository,
        'user-1',
        'conv-missing',
      ),
    ).rejects.toMatchObject({ code: 'AI_CONVERSATION_NOT_FOUND' });
  });

  it('throws WORKSPACE_NOT_FOUND when the caller has no personal workspace', async () => {
    const { conversationsRepository, workspacesRepository } = buildRepos();
    workspacesRepository.findPersonalWorkspaceForUser.mockResolvedValue(null);

    await expect(
      resolveAiConversationForCaller(
        conversationsRepository,
        workspacesRepository,
        'ghost-user',
        'conv-1',
      ),
    ).rejects.toMatchObject({ code: 'WORKSPACE_NOT_FOUND' });
    expect(conversationsRepository.findById).not.toHaveBeenCalled();
  });
});

describe('resolveAiMessageForCaller (workspace isolation)', () => {
  it('returns the message and its conversation when both belong to the caller workspace', async () => {
    const {
      conversationsRepository,
      messagesRepository,
      workspacesRepository,
    } = buildRepos();
    workspacesRepository.findPersonalWorkspaceForUser.mockResolvedValue(
      MY_WORKSPACE,
    );
    messagesRepository.findById.mockResolvedValue(
      message({ conversationId: 'conv-1' }),
    );
    conversationsRepository.findById.mockResolvedValue(
      conversation({ workspaceId: 'ws-mine' }),
    );

    const result = await resolveAiMessageForCaller(
      conversationsRepository,
      messagesRepository,
      workspacesRepository,
      'user-1',
      'msg-1',
    );
    expect(result.message.id).toBe('msg-1');
    expect(result.conversation.workspaceId).toBe('ws-mine');
  });

  it('throws AI_MESSAGE_NOT_FOUND when the message belongs to a conversation in another workspace', async () => {
    const {
      conversationsRepository,
      messagesRepository,
      workspacesRepository,
    } = buildRepos();
    workspacesRepository.findPersonalWorkspaceForUser.mockResolvedValue(
      MY_WORKSPACE,
    );
    messagesRepository.findById.mockResolvedValue(
      message({ conversationId: 'conv-other' }),
    );
    conversationsRepository.findById.mockResolvedValue(
      conversation({ id: 'conv-other', workspaceId: 'ws-someone-elses' }),
    );

    await expect(
      resolveAiMessageForCaller(
        conversationsRepository,
        messagesRepository,
        workspacesRepository,
        'user-1',
        'msg-1',
      ),
    ).rejects.toMatchObject({ code: 'AI_MESSAGE_NOT_FOUND' });
  });

  it('throws AI_MESSAGE_NOT_FOUND when the message id does not exist at all', async () => {
    const {
      conversationsRepository,
      messagesRepository,
      workspacesRepository,
    } = buildRepos();
    workspacesRepository.findPersonalWorkspaceForUser.mockResolvedValue(
      MY_WORKSPACE,
    );
    messagesRepository.findById.mockResolvedValue(null);

    await expect(
      resolveAiMessageForCaller(
        conversationsRepository,
        messagesRepository,
        workspacesRepository,
        'user-1',
        'msg-missing',
      ),
    ).rejects.toMatchObject({ code: 'AI_MESSAGE_NOT_FOUND' });
    expect(conversationsRepository.findById).not.toHaveBeenCalled();
  });
});
