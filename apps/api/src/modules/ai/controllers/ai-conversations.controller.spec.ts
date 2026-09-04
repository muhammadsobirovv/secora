import { describe, expect, it, jest } from '@jest/globals';
import type { CommandBus, QueryBus } from '@nestjs/cqrs';
import { AiConversationsController } from './ai-conversations.controller.js';
import { AiChatStreamHubService } from '../chat/ai-chat-stream-hub.service.js';
import type {
  AiMessageRecord,
  AiMessagesRepository,
} from '../domain/repositories/ai-messages.repository.interface.js';
import type {
  AiConversationRecord,
  AiConversationsRepository,
} from '../domain/repositories/ai-conversations.repository.interface.js';
import type { WorkspacesRepository } from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';

/// Module 18 — task #517 (SSE hardening audit). streamMessage() previously
/// took only `@Query('messageId')` with no `@CurrentUser()` at all — any
/// authenticated user who supplied any workspace's messageId got that
/// workspace's live assistant-message token stream or its persisted
/// final content/error. This spec proves the fix: authorization via
/// resolveAiMessageForCaller happens, and rejects, before the stream hub
/// or messages repository is ever touched with the caller-supplied
/// messageId — using the real AiChatStreamHubService (cheap, no external
/// dependencies) so the "never touched" assertion is meaningful rather
/// than trivially true against a stub.
function buildMessage(overrides: Partial<AiMessageRecord> = {}): AiMessageRecord {
  return {
    id: 'msg-1',
    conversationId: 'conv-1',
    role: 'ASSISTANT',
    content: 'hello',
    status: 'COMPLETE',
    provider: null,
    model: null,
    promptTokens: null,
    completionTokens: null,
    bookmarked: false,
    pinned: false,
    errorMessage: null,
    parentMessageId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildConversation(overrides: Partial<AiConversationRecord> = {}): AiConversationRecord {
  return {
    id: 'conv-1',
    workspaceId: 'ws-caller',
    projectId: 'proj-1',
    userId: 'user-owner',
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

function buildController(message: AiMessageRecord | null, conversation: AiConversationRecord | null) {
  const streamHub = new AiChatStreamHubService();
  const getSpy = jest.spyOn(streamHub, 'get');

  const messagesRepository: AiMessagesRepository = {
    findById: jest.fn(async () => message),
  } as unknown as AiMessagesRepository;

  const conversationsRepository: AiConversationsRepository = {
    findById: jest.fn(async () => conversation),
  } as unknown as AiConversationsRepository;

  const workspacesRepository: WorkspacesRepository = {
    findPersonalWorkspaceForUser: jest.fn(async () => ({ id: 'ws-caller' })),
  } as unknown as WorkspacesRepository;

  const controller = new AiConversationsController(
    {} as CommandBus,
    {} as QueryBus,
    streamHub,
    messagesRepository,
    conversationsRepository,
    workspacesRepository,
  );

  return { controller, streamHub, getSpy, messagesRepository };
}

const CALLER = { id: 'user-caller' } as unknown as RequestUser;

describe('AiConversationsController.streamMessage (task #517 fix)', () => {
  it('rejects and never touches the stream hub when the message belongs to another workspace', async () => {
    const { controller, getSpy } = buildController(
      buildMessage(),
      buildConversation({ workspaceId: 'ws-someone-else' }),
    );

    const observable = controller.streamMessage('conv-1', 'msg-1', CALLER);
    await expect(
      new Promise((resolve, reject) => {
        observable.subscribe({ next: resolve, error: reject, complete: resolve });
      }),
    ).rejects.toBeDefined();

    expect(getSpy).not.toHaveBeenCalled();
  });

  it('rejects when the messageId does not belong to the route conversationId, even in the same workspace', async () => {
    // Same workspace as the caller, but the message's real conversation
    // is a different one than what the route claims — defense in depth
    // against a caller passing a mismatched conversationId/messageId pair.
    const { controller, getSpy } = buildController(
      buildMessage({ conversationId: 'conv-real' }),
      buildConversation({ id: 'conv-real', workspaceId: 'ws-caller' }),
    );

    const observable = controller.streamMessage('conv-spoofed', 'msg-1', CALLER);
    await expect(
      new Promise((resolve, reject) => {
        observable.subscribe({ next: resolve, error: reject, complete: resolve });
      }),
    ).rejects.toBeDefined();

    expect(getSpy).not.toHaveBeenCalled();
  });

  it('rejects when the message does not exist at all', async () => {
    const { controller, getSpy } = buildController(null, null);

    const observable = controller.streamMessage('conv-1', 'missing-msg', CALLER);
    await expect(
      new Promise((resolve, reject) => {
        observable.subscribe({ next: resolve, error: reject, complete: resolve });
      }),
    ).rejects.toBeDefined();

    expect(getSpy).not.toHaveBeenCalled();
  });

  it('streams the active hub subject once authorized', async () => {
    const { controller, streamHub } = buildController(
      buildMessage({ conversationId: 'conv-1' }),
      buildConversation({ id: 'conv-1', workspaceId: 'ws-caller' }),
    );

    const active = streamHub.start('msg-1');
    const observable = controller.streamMessage('conv-1', 'msg-1', CALLER);

    const received: unknown[] = [];
    const done = new Promise<void>((resolve) => {
      observable.subscribe({
        next: (event) => received.push(event),
        complete: resolve,
      });
    });

    // Give the async authorization check a tick to resolve and subscribe
    // to the hub's ReplaySubject before emitting.
    await new Promise((resolve) => setTimeout(resolve, 0));
    active.subject.next({ type: 'cancelled' });
    active.subject.complete();
    await done;

    expect(received).toHaveLength(1);
  });
});
