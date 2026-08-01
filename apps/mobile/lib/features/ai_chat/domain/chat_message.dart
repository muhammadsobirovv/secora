enum ChatRole { user, assistant, system, tool }

extension ChatRoleCodec on ChatRole {
  static ChatRole fromWire(String value) =>
      ChatRole.values.firstWhere((r) => r.name.toUpperCase() == value.toUpperCase(), orElse: () => ChatRole.assistant);
}

/// Mirrors packages/shared's `AiMessageDto` (ai.ts).
class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.conversationId,
    required this.role,
    required this.content,
    required this.status,
    required this.bookmarked,
    required this.pinned,
  });

  final String id;
  final String conversationId;
  final ChatRole role;
  final String content;
  final String status;
  final bool bookmarked;
  final bool pinned;

  factory ChatMessage.fromJson(Map<String, dynamic> json) => ChatMessage(
        id: json['id'] as String,
        conversationId: json['conversationId'] as String,
        role: ChatRoleCodec.fromWire(json['role'] as String),
        content: json['content'] as String,
        status: json['status'] as String,
        bookmarked: json['bookmarked'] as bool? ?? false,
        pinned: json['pinned'] as bool? ?? false,
      );

  ChatMessage copyWith({String? content, String? status}) => ChatMessage(
        id: id,
        conversationId: conversationId,
        role: role,
        content: content ?? this.content,
        status: status ?? this.status,
        bookmarked: bookmarked,
        pinned: pinned,
      );
}

/// Mirrors `AiConversationDto` (ai.ts) — Conversation History / Bookmarks /
/// Pinned Conversations (AI Security Copilot spec items).
class ChatConversation {
  const ChatConversation({
    required this.id,
    required this.projectId,
    required this.pinned,
    required this.messageCount,
    required this.updatedAt,
    this.title,
    this.lastMessagePreview,
    this.provider,
  });

  final String id;
  final String projectId;
  final String? title;
  final String? provider;
  final bool pinned;
  final int messageCount;
  final String? lastMessagePreview;
  final DateTime updatedAt;

  factory ChatConversation.fromJson(Map<String, dynamic> json) => ChatConversation(
        id: json['id'] as String,
        projectId: json['projectId'] as String,
        title: json['title'] as String?,
        provider: json['provider'] as String?,
        pinned: json['pinned'] as bool,
        messageCount: (json['messageCount'] as num).toInt(),
        lastMessagePreview: json['lastMessagePreview'] as String?,
        updatedAt: DateTime.parse(json['updatedAt'] as String),
      );
}

/// Mirrors `AiChatMessageStreamEvent` (ai.ts) — the SSE event union every
/// streamed assistant reply emits.
sealed class ChatStreamEvent {
  const ChatStreamEvent();

  factory ChatStreamEvent.fromJson(Map<String, dynamic> json) {
    return switch (json['type'] as String) {
      'delta' => ChatDelta(json['content'] as String),
      'tool_call' => ChatToolCall(json['toolName'] as String),
      'tool_result' => ChatToolResult(json['toolName'] as String),
      'done' => ChatDone(ChatMessage.fromJson(json['message'] as Map<String, dynamic>)),
      'error' => ChatError(json['message'] as String),
      'cancelled' => const ChatCancelled(),
      _ => ChatError('Unknown event: ${json['type']}'),
    };
  }
}

final class ChatDelta extends ChatStreamEvent {
  const ChatDelta(this.content);
  final String content;
}

final class ChatToolCall extends ChatStreamEvent {
  const ChatToolCall(this.toolName);
  final String toolName;
}

final class ChatToolResult extends ChatStreamEvent {
  const ChatToolResult(this.toolName);
  final String toolName;
}

final class ChatDone extends ChatStreamEvent {
  const ChatDone(this.message);
  final ChatMessage message;
}

final class ChatError extends ChatStreamEvent {
  const ChatError(this.message);
  final String message;
}

final class ChatCancelled extends ChatStreamEvent {
  const ChatCancelled();
}
