import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:flutter_highlight/flutter_highlight.dart';
import 'package:flutter_highlight/themes/atom-one-dark.dart';
import 'package:markdown/markdown.dart' as md;

import '../../../../core/theme/app_colors.dart';
import '../../domain/chat_message.dart';
import 'mermaid_view.dart';

/// Renders one chat message: Markdown + syntax-highlighted code fences
/// (Smart Code Block parity with Module 5's web chat) + a dedicated Mermaid
/// renderer for ```mermaid fences (Interactive Canvas). Artifacts (Module 5
/// Phase 2's standalone code/preview panel) are represented here as a
/// bordered card wrapping the fenced block rather than a separate modal
/// surface — full Artifact Mode parity (a resizable side panel) is a
/// larger, dedicated interaction pattern deferred to a later mobile pass.
class ChatMessageBubble extends StatelessWidget {
  const ChatMessageBubble({super.key, required this.message, required this.isUser});
  final String message;
  final bool isUser;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.85),
        margin: const EdgeInsets.symmetric(vertical: 6),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: isUser ? AppColors.primary.withValues(alpha: 0.15) : AppColors.surfaceElevated,
          borderRadius: BorderRadius.circular(14),
        ),
        child: MarkdownBody(
          data: message,
          selectable: true,
          extensionSet: md.ExtensionSet.gitHubFlavored,
          builders: {'code': _CodeBlockBuilder()},
        ),
      ),
    );
  }
}

class _CodeBlockBuilder extends MarkdownElementBuilder {
  @override
  Widget? visitElementAfter(md.Element element, TextStyle? preferredStyle) {
    final language = element.attributes['class']?.replaceFirst('language-', '') ?? '';
    final code = element.textContent;

    if (language == 'mermaid') {
      return MermaidView(diagram: code);
    }

    if (element.attributes['class'] == null) return null; // inline code — let default styling handle it.

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 6),
      decoration: BoxDecoration(color: const Color(0xFF1E1E1E), borderRadius: BorderRadius.circular(8)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (language.isNotEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              child: Text(language, style: const TextStyle(color: Colors.white54, fontSize: 11)),
            ),
          Padding(
            padding: const EdgeInsets.all(10),
            child: HighlightView(
              code,
              language: language.isEmpty ? 'plaintext' : language,
              theme: atomOneDarkTheme,
              padding: EdgeInsets.zero,
              textStyle: const TextStyle(fontFamily: 'monospace', fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }
}
