import 'dart:convert';

import '../../../core/network/api_client.dart';
import '../../../core/network/sse_client.dart';
import '../domain/chat_message.dart';

/// AI Security Copilot chat — `AI_CONVERSATION_ENDPOINTS`/`AI_MESSAGE_ENDPOINTS`
/// (ai-endpoints.ts). Streaming Chat / Conversation History / Bookmarks /
/// Pinned Conversations / Provider Switching all live here; Local AI vs.
/// Cloud AI is the workspace's Privacy Mode setting (`AI_PRIVACY_ENDPOINTS`,
/// Module 11) surfaced in Settings > AI Providers, not chosen per-message.
class AiChatRepository {
  AiChatRepository({required ApiClient apiClient, required SseClient sseClient})
      : _api = apiClient,
        _sse = sseClient;

  final ApiClient _api;
  final SseClient _sse;

  Future<List<ChatConversation>> listConversations() => _api.get<List<ChatConversation>>(
        '/ai/conversations',
        decode: (json) => (json as List<dynamic>)
            .map((e) => ChatConversation.fromJson(e as Map<String, dynamic>))
            .toList(),
      );

  Future<ChatConversation> createConversation(String projectId) => _api.post<ChatConversation>(
        '/ai/conversations',
        body: {'projectId': projectId},
        decode: (json) => ChatConversation.fromJson(json as Map<String, dynamic>),
      );

  Future<List<ChatMessage>> getMessages(String conversationId) => _api.get<List<ChatMessage>>(
        '/ai/conversations/$conversationId',
        decode: (json) => ((json as Map<String, dynamic>)['messages'] as List<dynamic>)
            .map((e) => ChatMessage.fromJson(e as Map<String, dynamic>))
            .toList(),
      );

  Future<void> pinConversation(String id, bool pinned) => pinned
      ? _api.post<void>('/ai/conversations/$id/pin')
      : _api.delete<void>('/ai/conversations/$id/pin');

  Future<void> archiveConversation(String id) => _api.post<void>('/ai/conversations/$id/archive');

  Future<void> deleteConversation(String id) => _api.delete<void>('/ai/conversations/$id');

  Future<void> bookmarkMessage(String messageId, bool bookmarked) => bookmarked
      ? _api.post<void>('/ai/messages/$messageId/bookmark')
      : _api.delete<void>('/ai/messages/$messageId/bookmark');

  /// Streaming Chat — POSTs the user message then consumes the assistant's
  /// reply as a live `ChatStreamEvent` sequence (delta/tool_call/tool_result/
  /// done/error/cancelled). Callers accumulate `ChatDelta.content` for the
  /// live-typing effect and stop on `ChatDone`/`ChatError`/`ChatCancelled`.
  Stream<ChatStreamEvent> streamMessage(String conversationId, String content) {
    return _sse
        .connect(
          '/ai/conversations/$conversationId/messages/stream',
          method: 'POST',
          body: {'content': content},
        )
        .map((raw) => ChatStreamEvent.fromJson(jsonDecode(raw) as Map<String, dynamic>));
  }

  Future<void> cancelMessage(String conversationId) =>
      _api.post<void>('/ai/conversations/$conversationId/messages/cancel');
}
