import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';

import '../storage/secure_token_storage.dart';
import 'api_client.dart';

/// Manual SSE consumption over Dio's `ResponseType.stream`, mirroring
/// apps/web's `useReconJobLogs`/`useAgentRunStream` hooks (manual `fetch()`
/// + `ReadableStream` reader) rather than a native EventSource — Flutter has
/// no built-in EventSource either, and even if a plugin did, the same
/// apps/web doc-comment reason applies: it can't attach a `Authorization:
/// Bearer <token>` header, which every one of this API's SSE endpoints
/// (`AGENT_ORCHESTRATION_ENDPOINTS.stream`, `AI_CONVERSATION_ENDPOINTS
/// .streamMessage`) requires.
///
/// Yields raw event payload strings (the JSON after `data: `) one at a time;
/// callers `jsonDecode` and pattern-match their own event union
/// (`AiChatMessageStreamEvent`, `OrchestrationStreamEvent`).
class SseClient {
  SseClient({required ApiClient apiClient, required SecureTokenStorage tokenStorage})
      : _api = apiClient,
        _tokens = tokenStorage;

  final ApiClient _api;
  final SecureTokenStorage _tokens;

  Stream<String> connect(
    String path, {
    String method = 'GET',
    Object? body,
  }) {
    final controller = StreamController<String>();
    CancelToken? cancelToken;

    Future<void> run() async {
      cancelToken = CancelToken();
      try {
        final token = await _tokens.readAccessToken();
        final response = await _api.raw.request<ResponseBody>(
          path,
          data: body,
          options: Options(
            method: method,
            responseType: ResponseType.stream,
            headers: {
              if (token != null) 'Authorization': 'Bearer $token',
              'Accept': 'text/event-stream',
            },
          ),
          cancelToken: cancelToken,
        );

        final stream = response.data!.stream
            .cast<List<int>>()
            .transform(utf8.decoder)
            .transform(const LineSplitter());

        final buffer = StringBuffer();
        await for (final line in stream) {
          if (line.isEmpty) {
            if (buffer.isNotEmpty) {
              controller.add(buffer.toString());
              buffer.clear();
            }
            continue;
          }
          if (line.startsWith('data:')) {
            buffer.write(line.substring(5).trimLeft());
          }
          // Other SSE fields (event:, id:, retry:) are not used by this
          // API's stream endpoints — every event is a bare `data:` line of
          // JSON, one event per line (see AgentOrchestratorController's
          // `@Sse()` handler / AiChatController's stream handler).
        }
        await controller.close();
      } catch (e, st) {
        if (!controller.isClosed) controller.addError(e, st);
        await controller.close();
      }
    }

    controller.onListen = () => unawaited(run());
    controller.onCancel = () => cancelToken?.cancel('Listener cancelled');
    return controller.stream;
  }
}
