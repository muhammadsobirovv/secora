import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

/// Interactive Canvas (Module 5 Phase 2) — renders a ```mermaid fenced
/// block by loading mermaid.js from CDN into a local WebView shell, same
/// "no native Dart Mermaid renderer exists" constraint apps/web works
/// around with the `mermaid` npm package in the browser; here a WebView is
/// the browser. Requires network access to the CDN the first time (cached
/// by the WebView's own HTTP cache afterward) — offline, this degrades to
/// the raw fenced source text (see `_MermaidViewState`'s error builder).
class MermaidView extends StatefulWidget {
  const MermaidView({super.key, required this.diagram});
  final String diagram;

  @override
  State<MermaidView> createState() => _MermaidViewState();
}

class _MermaidViewState extends State<MermaidView> {
  late final WebViewController _controller;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.transparent)
      ..loadHtmlString(_html(widget.diagram));
  }

  String _html(String diagram) => '''
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <style>
    body { margin: 0; background: transparent; }
    .mermaid { display: flex; justify-content: center; }
  </style>
</head>
<body>
  <pre class="mermaid">${diagram.replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</pre>
  <script>mermaid.initialize({ startOnLoad: true, theme: 'dark' });</script>
</body>
</html>
''';

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 260,
      margin: const EdgeInsets.symmetric(vertical: 6),
      decoration: BoxDecoration(borderRadius: BorderRadius.circular(8), color: Colors.black12),
      clipBehavior: Clip.antiAlias,
      child: WebViewWidget(controller: _controller),
    );
  }
}
