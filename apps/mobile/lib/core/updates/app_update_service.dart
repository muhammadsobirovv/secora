import 'package:package_info_plus/package_info_plus.dart';

import '../network/api_client.dart';

/// Module 14 — Auto Update. Result of one version check against the
/// backend's liveness probe (`GET /observability/health`, same
/// unauthenticated endpoint `apps/web`'s stale-build banner polls — see
/// `OBSERVABILITY_HEALTH_ENDPOINTS` in packages/shared).
class AppUpdateInfo {
  const AppUpdateInfo({
    required this.updateAvailable,
    required this.currentVersion,
    this.serverVersion,
  });

  final bool updateAvailable;
  final String currentVersion;
  final String? serverVersion;
}

/// Module 14 — Auto Update. A mobile app store (Apple App Store, Google
/// Play) is the only party allowed to actually replace this app's
/// binary — there is no "self-update" for a mobile app the way
/// `apps/desktop`'s Tauri updater or a server redeploy works. This
/// service's entire job is the "check" half only: compare the running
/// app's own version (`package_info_plus`, reading the platform's real
/// installed-app metadata, not just `pubspec.yaml`'s static string) to
/// the backend's currently-deployed version, and report whether they
/// differ. `AppUpdateInfo.updateAvailable` is a *signal*, not a
/// version-range decision — this deliberately does not distinguish a
/// patch-level bump from a breaking major version, unlike a real
/// semver comparison, because the backend's `version` field is this
/// monorepo's own release version, not a per-client API compatibility
/// contract (see docs/architecture/api-gateway.md's versioning-policy
/// section: this API evolves additively, so "server is one version
/// ahead of what shipped when you installed the app" is worth surfacing
/// but is not itself evidence of a breaking incompatibility).
class AppUpdateService {
  AppUpdateService({required ApiClient apiClient}) : _apiClient = apiClient;

  final ApiClient _apiClient;

  Future<AppUpdateInfo> check() async {
    final currentVersion = (await PackageInfo.fromPlatform()).version;
    try {
      final serverVersion = await _apiClient.get<String?>(
        '/observability/health',
        public: true,
        decode: (json) => (json as Map<String, dynamic>)['version'] as String?,
      );
      final updateAvailable =
          serverVersion != null && serverVersion != 'unknown' && serverVersion != currentVersion;
      return AppUpdateInfo(
        updateAvailable: updateAvailable,
        currentVersion: currentVersion,
        serverVersion: serverVersion,
      );
    } catch (_) {
      // Offline, server unreachable, or a malformed response — a failed
      // version check should never block app startup or show an error
      // of its own; just report "no update signal this session."
      return AppUpdateInfo(updateAvailable: false, currentVersion: currentVersion);
    }
  }
}
