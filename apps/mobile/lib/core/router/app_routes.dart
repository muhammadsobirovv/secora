/// Central route-path registry — every `GoRoute.path`/`context.go()` call
/// in the app references a constant from here instead of a string literal,
/// same rationale as packages/shared's `*_ENDPOINTS` objects for HTTP
/// routes: one place to change a path, no risk of a typo'd literal drifting
/// out of sync between the router config and a `context.go(...)` call site.
abstract final class AppRoutes {
  static const String splash = '/splash';
  static const String login = '/login';
  static const String register = '/register';
  static const String mfaChallenge = '/mfa-challenge';
  static const String forgotPassword = '/forgot-password';
  static const String resetPassword = '/reset-password';
  static const String oauthWebview = '/oauth/:provider';
  static const String pinLock = '/pin-lock';
  static const String pinSetup = '/settings/security/pin-setup';
  static const String sessions = '/settings/security/sessions';

  static const String home = '/';
  static const String dashboard = '/dashboard';
  static const String projects = '/projects';
  static const String projectDetail = '/projects/:projectId';
  static const String targetDetail = '/projects/:projectId/targets/:targetId';
  static const String findings = '/findings';
  static const String findingDetail = '/findings/:findingId';
  static const String reports = '/reports';
  static const String reportDetail = '/reports/:reportId';
  static const String agent = '/agent';
  static const String agentChat = '/agent/chat/:conversationId';
  static const String agentRuns = '/agent/runs';
  static const String agentRunDetail = '/agent/runs/:runId';
  static const String knowledgeBase = '/knowledge-base';
  static const String notifications = '/notifications';
  static const String evidenceCapture = '/evidence/capture';
  static const String files = '/files';
  static const String search = '/search';
  static const String settings = '/settings';
  static const String workspace = '/workspace';
  static const String analytics = '/analytics';

  static String projectDetailPath(String projectId) => '/projects/$projectId';
  static String targetDetailPath(String projectId, String targetId) =>
      '/projects/$projectId/targets/$targetId';
  static String findingDetailPath(String findingId) => '/findings/$findingId';
  static String reportDetailPath(String reportId) => '/reports/$reportId';
  static String agentChatPath(String conversationId) => '/agent/chat/$conversationId';
  static String agentRunDetailPath(String runId) => '/agent/runs/$runId';
}
