import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/sse_client.dart';
import '../../../core/providers/core_providers.dart';
import '../data/ai_chat_repository.dart';
import '../domain/chat_message.dart';

final sseClientProvider = Provider<SseClient>((ref) {
  return SseClient(
    apiClient: ref.watch(apiClientProvider),
    tokenStorage: ref.watch(secureTokenStorageProvider),
  );
});

final aiChatRepositoryProvider = Provider<AiChatRepository>((ref) {
  return AiChatRepository(apiClient: ref.watch(apiClientProvider), sseClient: ref.watch(sseClientProvider));
});

final conversationListProvider = FutureProvider.autoDispose<List<ChatConversation>>((ref) {
  return ref.watch(aiChatRepositoryProvider).listConversations();
});

/// Per-conversation live chat state — messages loaded once, then appended
/// to as the user sends new ones and the assistant's streamed reply
/// accumulates token-by-token.
final chatNotifierProvider =
    NotifierProvider.autoDispose.family<ChatNotifier, ChatConversationState, String>(ChatNotifier.new);

class ChatConversationState {
  const ChatConversationState({
    this.messages = const [],
    this.streamingContent,
    this.isStreaming = false,
    this.error,
  });

  final List<ChatMessage> messages;
  final String? streamingContent;
  final bool isStreaming;
  final String? error;

  ChatConversationState copyWith({
    List<ChatMessage>? messages,
    String? streamingContent,
    bool clearStreamingContent = false,
    bool? isStreaming,
    String? error,
    bool clearError = false,
  }) =>
      ChatConversationState(
        messages: messages ?? this.messages,
        streamingContent: clearStreamingContent ? null : (streamingContent ?? this.streamingContent),
        isStreaming: isStreaming ?? this.isStreaming,
        error: clearError ? null : (error ?? this.error),
      );
}

class ChatNotifier extends FamilyNotifier<ChatConversationState, String> {
  @override
  ChatConversationState build(String conversationId) {
    Future.microtask(_loadHistory);
    return const ChatConversationState();
  }

  Future<void> _loadHistory() async {
    try {
      final messages = await ref.read(aiChatRepositoryProvider).getMessages(arg);
      state = state.copyWith(messages: messages);
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }

  Future<void> sendMessage(String content) async {
    state = state.copyWith(isStreaming: true, clearStreamingContent: true, clearError: true);
    final buffer = StringBuffer();
    try {
      await for (final event in ref.read(aiChatRepositoryProvider).streamMessage(arg, content)) {
        switch (event) {
          case ChatDelta(:final content):
            buffer.write(content);
            state = state.copyWith(streamingContent: buffer.toString());
          case ChatDone(:final message):
            state = state.copyWith(
              messages: [...state.messages, message],
              clearStreamingContent: true,
              isStreaming: false,
            );
          case ChatError(:final message):
            state = state.copyWith(error: message, isStreaming: false, clearStreamingContent: true);
          case ChatCancelled():
            state = state.copyWith(isStreaming: false, clearStreamingContent: true);
          case ChatToolCall():
          case ChatToolResult():
            // Surfaced as a transient status line by the chat screen reading
            // `state.streamingContent`'s current buffer — no state change
            // needed beyond what's already accumulated.
            break;
        }
      }
    } catch (e) {
      state = state.copyWith(error: e.toString(), isStreaming: false);
    }
  }

  Future<void> cancel() async {
    await ref.read(aiChatRepositoryProvider).cancelMessage(arg);
    state = state.copyWith(isStreaming: false);
  }
}
