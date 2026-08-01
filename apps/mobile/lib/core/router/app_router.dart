import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/application/auth_notifier.dart';
import '../../features/auth/domain/auth_state.dart';
import '../../features/auth/presentation/screens/forgot_password_screen.dart';
import '../../features/auth/presentation/screens/login_screen.dart';
import '../../features/auth/presentation/screens/mfa_challenge_screen.dart';
import '../../features/auth/presentation/screens/oauth_webview_screen.dart';
import '../../features/auth/presentation/screens/pin_lock_screen.dart';
import '../../features/auth/presentation/screens/register_screen.dart';
import '../../features/auth/presentation/screens/sessions_screen.dart';
import '../../features/agent/presentation/screens/agent_run_detail_screen.dart';
import '../../features/agent/presentation/screens/agent_screen.dart';
import '../../features/agent/presentation/screens/knowledge_base_screen.dart';
import '../../features/analytics/presentation/screens/analytics_screen.dart';
import '../../features/ai_chat/presentation/screens/ai_chat_screen.dart';
import '../../features/auth/presentation/screens/splash_screen.dart';
import '../../features/dashboard/presentation/screens/dashboard_screen.dart';
import '../../features/evidence/presentation/screens/evidence_capture_screen.dart';
import '../../features/files/presentation/screens/file_manager_screen.dart';
import '../../features/search/presentation/screens/global_search_screen.dart';
import '../../features/settings/presentation/screens/settings_screen.dart';
import '../../features/workspace/presentation/screens/workspace_screen.dart';
import '../../features/findings/presentation/screens/finding_detail_screen.dart';
import '../../features/findings/presentation/screens/findings_screen.dart';
import '../../features/notifications/presentation/screens/notifications_screen.dart';
import '../../features/projects/presentation/screens/project_detail_screen.dart';
import '../../features/projects/presentation/screens/projects_screen.dart';
import '../../features/reports/presentation/screens/report_detail_screen.dart';
import '../../features/reports/presentation/screens/reports_screen.dart';
import 'app_routes.dart';
import 'app_shell.dart';

final _rootNavigatorKey = GlobalKey<NavigatorState>();

/// Rebuilds `GoRouter`'s `refreshListenable` whenever [authNotifierProvider]
/// changes, so the redirect callback below re-evaluates on every auth-state
/// transition (login, MFA, lock, logout) without the UI needing to call
/// `context.go(...)` manually from inside `AuthNotifier` (which would
/// couple `features/auth` to the router). This is the standard
/// riverpod+go_router integration pattern for a redirect-driven auth guard.
class _AuthRefreshListenable extends ChangeNotifier {
  _AuthRefreshListenable(Ref ref) {
    ref.listen(authNotifierProvider, (_, __) => notifyListeners());
  }
}

final routerProvider = Provider<GoRouter>((ref) {
  final refreshListenable = _AuthRefreshListenable(ref);

  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: AppRoutes.splash,
    refreshListenable: refreshListenable,
    redirect: (context, state) {
      final authState = ref.read(authNotifierProvider);
      final path = state.matchedLocation;
      final isAuthRoute = {
        AppRoutes.login,
        AppRoutes.register,
        AppRoutes.mfaChallenge,
        AppRoutes.forgotPassword,
      }.contains(path) || path.startsWith('/oauth/');

      return switch (authState) {
        AuthLoading() => path == AppRoutes.splash ? null : AppRoutes.splash,
        AuthUnauthenticated() => isAuthRoute ? null : AppRoutes.login,
        AuthMfaRequired() => path == AppRoutes.mfaChallenge ? null : AppRoutes.mfaChallenge,
        AuthLocked() => path == AppRoutes.pinLock ? null : AppRoutes.pinLock,
        AuthAuthenticated() =>
          (isAuthRoute || path == AppRoutes.splash || path == AppRoutes.pinLock)
              ? AppRoutes.dashboard
              : null,
      };
    },
    routes: [
      GoRoute(path: AppRoutes.splash, builder: (_, __) => const SplashScreen()),
      GoRoute(path: AppRoutes.login, builder: (_, __) => const LoginScreen()),
      GoRoute(path: AppRoutes.register, builder: (_, __) => const RegisterScreen()),
      GoRoute(path: AppRoutes.mfaChallenge, builder: (_, __) => const MfaChallengeScreen()),
      GoRoute(
        path: AppRoutes.forgotPassword,
        builder: (_, state) => ForgotPasswordScreen(resetToken: state.uri.queryParameters['token']),
      ),
      GoRoute(
        path: AppRoutes.oauthWebview,
        builder: (_, state) => OAuthWebviewScreen(
          startUrl: Uri.decodeComponent(state.uri.queryParameters['url'] ?? ''),
        ),
      ),
      GoRoute(path: AppRoutes.pinLock, builder: (_, __) => const PinLockScreen()),
      GoRoute(path: AppRoutes.sessions, builder: (_, __) => const SessionsScreen()),
      GoRoute(
        path: AppRoutes.notifications,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, __) => const NotificationsScreen(),
      ),
      GoRoute(
        path: AppRoutes.evidenceCapture,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, __) => const EvidenceCaptureScreen(),
      ),
      GoRoute(
        path: AppRoutes.files,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, __) => const FileManagerScreen(),
      ),
      GoRoute(
        path: AppRoutes.search,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, __) => const GlobalSearchScreen(),
      ),
      GoRoute(
        path: AppRoutes.workspace,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, __) => const WorkspaceScreen(),
      ),
      GoRoute(
        path: AppRoutes.analytics,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, __) => const AnalyticsScreen(),
      ),
      GoRoute(
        path: AppRoutes.findingDetail,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, state) => FindingDetailScreen(findingId: state.pathParameters['findingId']!),
      ),
      GoRoute(
        path: AppRoutes.reports,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, __) => const ReportsScreen(),
      ),
      GoRoute(
        path: AppRoutes.agentChat,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, state) =>
            AiChatScreen(conversationId: state.pathParameters['conversationId']!),
      ),
      GoRoute(
        path: AppRoutes.agentRunDetail,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, state) => AgentRunDetailScreen(runId: state.pathParameters['runId']!),
      ),
      GoRoute(
        path: AppRoutes.knowledgeBase,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, __) => const KnowledgeBaseScreen(),
      ),
      GoRoute(
        path: AppRoutes.reportDetail,
        parentNavigatorKey: _rootNavigatorKey,
        builder: (_, state) => ReportDetailScreen(reportId: state.pathParameters['reportId']!),
      ),

      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) => AppShell(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(routes: [
            GoRoute(
              path: AppRoutes.dashboard,
              builder: (_, __) => const DashboardScreen(),
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: AppRoutes.projects,
              builder: (_, __) => const ProjectsScreen(),
              routes: [
                GoRoute(
                  path: ':projectId',
                  builder: (_, state) =>
                      ProjectDetailScreen(projectId: state.pathParameters['projectId']!),
                ),
              ],
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: AppRoutes.findings,
              builder: (_, __) => const FindingsScreen(),
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: AppRoutes.agent,
              builder: (_, __) => const AgentScreen(),
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: AppRoutes.settings,
              builder: (_, __) => const SettingsScreen(),
            ),
          ]),
        ],
      ),
    ],
  );
});
