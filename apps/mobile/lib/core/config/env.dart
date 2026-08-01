/// Build-time environment configuration.
///
/// Mirrors apps/web/lib/api/client.ts's `API_BASE_URL` (`NEXT_PUBLIC_API_URL`)
/// convention: a compile-time default with an override hook, here via
/// `--dart-define=API_BASE_URL=...` instead of a `.env` file (Flutter has no
/// built-in dotenv support without an extra plugin, and a compile-time define
/// keeps the mobile client's config story identical in shape to the web
/// client's — one base URL, one place it's read from).
class Env {
  const Env._();

  /// Same default apps/web uses for local development.
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:3000',
  );

  /// Matches AGENT_ORCHESTRATION_ENDPOINTS.stream / AI_CONVERSATION_ENDPOINTS
  /// .streamMessage's SSE path base — same host as [apiBaseUrl].
  static String get sseBaseUrl => apiBaseUrl;

  static const bool isProduction = bool.fromEnvironment(
    'dart.vm.product',
  );

  /// Toggles verbose Dio/AppLogger output and the in-app Developer Mode
  /// settings section (task: Settings feature — Developer Mode).
  static const bool developerModeAvailable = !isProduction;
}
