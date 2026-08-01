import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../../../core/config/env.dart';
import '../../application/auth_notifier.dart';

/// Google/GitHub OAuth (Auth feature). Loads the backend's
/// `/auth/oauth/:provider` start URL in an in-app WebView (no separate
/// native OAuth SDK per provider — the backend already owns the full OAuth
/// dance for apps/web, this reuses the identical server-side flow) and
/// intercepts the callback redirect to `<apiBaseUrl>/auth/oauth/:provider/callback?code=...`,
/// extracting `code` and completing sign-in via `AuthRepository.exchangeOAuthCode`
/// — same contract as apps/web's `oauthExchange()`.
class OAuthWebviewScreen extends ConsumerStatefulWidget {
  const OAuthWebviewScreen({super.key, required this.startUrl});
  final String startUrl;

  @override
  ConsumerState<OAuthWebviewScreen> createState() => _OAuthWebviewScreenState();
}

class _OAuthWebviewScreenState extends ConsumerState<OAuthWebviewScreen> {
  late final WebViewController _controller;
  bool _handled = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(onNavigationRequest: (request) {
          final uri = Uri.tryParse(request.url);
          if (uri != null &&
              uri.toString().startsWith(Env.apiBaseUrl) &&
              uri.path.contains('/callback') &&
              uri.queryParameters.containsKey('code') &&
              !_handled) {
            _handled = true;
            _completeSignIn(uri.queryParameters['code']!);
            return NavigationDecision.prevent;
          }
          return NavigationDecision.navigate;
        }),
      )
      ..loadRequest(Uri.parse(widget.startUrl));
  }

  Future<void> _completeSignIn(String code) async {
    try {
      await ref.read(authNotifierProvider.notifier).completeOAuth(code);
      if (mounted) context.pop();
    } catch (e) {
      setState(() => _error = 'Sign-in failed: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Sign in'),
        leading: IconButton(icon: const Icon(Icons.close), onPressed: () => context.pop()),
      ),
      body: _error != null
          ? Center(child: Text(_error!, style: const TextStyle(color: Colors.redAccent)))
          : WebViewWidget(controller: _controller),
    );
  }
}
