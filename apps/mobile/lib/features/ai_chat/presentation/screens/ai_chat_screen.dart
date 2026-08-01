import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../voice/application/voice_providers.dart';
import '../../application/ai_chat_providers.dart';
import '../widgets/chat_message_bubble.dart';

/// Streaming Chat + Markdown + Syntax Highlighting + Mermaid + Voice Chat —
/// AI Security Copilot spec items. Provider Switching (Local/Cloud AI) is
/// a Settings > AI Providers concern (Privacy Mode), not a per-message
/// toggle here — see `features/settings`.
class AiChatScreen extends ConsumerStatefulWidget {
  const AiChatScreen({super.key, required this.conversationId});
  final String conversationId;

  @override
  ConsumerState<AiChatScreen> createState() => _AiChatScreenState();
}

class _AiChatScreenState extends ConsumerState<AiChatScreen> {
  final _controller = TextEditingController();
  final _scrollController = ScrollController();

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _send([String? voiceText]) async {
    final text = voiceText ?? _controller.text.trim();
    if (text.isEmpty) return;
    _controller.clear();
    _scrollToBottom();
    await ref.read(chatNotifierProvider(widget.conversationId).notifier).sendMessage(text);
    _scrollToBottom();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(chatNotifierProvider(widget.conversationId));
    final isListening = ref.watch(voiceListeningProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('AI Copilot')),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              controller: _scrollController,
              padding: const EdgeInsets.all(12),
              children: [
                for (final m in state.messages)
                  ChatMessageBubble(message: m.content, isUser: m.role.name == 'user'),
                if (state.streamingContent != null)
                  ChatMessageBubble(message: state.streamingContent!, isUser: false),
                if (state.isStreaming && state.streamingContent == null)
                  const Padding(
                    padding: EdgeInsets.all(8),
                    child: Row(children: [
                      SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
                      SizedBox(width: 8),
                      Text('Thinking...', style: TextStyle(color: AppColors.textSecondary)),
                    ]),
                  ),
                if (state.error != null)
                  Padding(
                    padding: const EdgeInsets.all(8),
                    child: Text(state.error!, style: const TextStyle(color: AppColors.danger)),
                  ),
              ],
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: Row(
                children: [
                  IconButton(
                    icon: Icon(isListening ? Icons.mic : Icons.mic_none, color: isListening ? AppColors.danger : null),
                    tooltip: isListening ? 'Stop listening' : 'Voice input',
                    onPressed: () async {
                      final text = await ref.read(voiceListeningProvider.notifier).toggleListening();
                      if (text != null && text.isNotEmpty) await _send(text);
                    },
                  ),
                  Expanded(
                    child: TextField(
                      controller: _controller,
                      minLines: 1,
                      maxLines: 5,
                      decoration: const InputDecoration(hintText: 'Ask the AI Security Copilot...'),
                      onSubmitted: (_) => _send(),
                    ),
                  ),
                  if (state.isStreaming)
                    IconButton(
                      icon: const Icon(Icons.stop_circle_outlined, color: AppColors.danger),
                      onPressed: () => ref.read(chatNotifierProvider(widget.conversationId).notifier).cancel(),
                    )
                  else
                    IconButton(icon: const Icon(Icons.send), onPressed: _send),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
