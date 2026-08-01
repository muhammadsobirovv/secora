import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../../core/providers/core_providers.dart';
import '../../../core/storage/secure_token_storage.dart';
import '../data/auth_repository.dart';
import '../data/device_lock_service.dart';
import '../domain/auth_state.dart';
import '../domain/user.dart';

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepository(
    apiClient: ref.watch(apiClientProvider),
    tokenStorage: ref.watch(secureTokenStorageProvider),
  );
});

final deviceLockServiceProvider = Provider<DeviceLockService>((ref) {
  return DeviceLockService(tokenStorage: ref.watch(secureTokenStorageProvider));
});

final authNotifierProvider = NotifierProvider<AuthNotifier, AuthState>(AuthNotifier.new);

/// Owns [AuthState] end-to-end: cold-start token validation, login/MFA/
/// OAuth, logout, and the PIN-lock gate that re-locks the app whenever it
/// resumes from the background (see `app.dart`'s `AppLifecycleListener`).
/// This is the single source of truth `core/router/app_router.dart`'s
/// redirect guard reads — every other feature only ever *reads*
/// `authNotifierProvider` for the current [AppUser], never mutates it
/// directly.
class AuthNotifier extends Notifier<AuthState> {
  late AuthRepository _repository;
  late DeviceLockService _deviceLock;
  late SecureTokenStorage _tokenStorage;

  @override
  AuthState build() {
    _repository = ref.watch(authRepositoryProvider);
    _deviceLock = ref.watch(deviceLockServiceProvider);
    _tokenStorage = ref.watch(secureTokenStorageProvider);
    // Fire-and-forget: resolves to Unauthenticated/Locked/Authenticated once
    // the stored refresh token (if any) has been validated against
    // `GET /auth/me`. The splash screen watches this provider and renders
    // while state is `AuthLoading`.
    Future.microtask(_restoreSession);
    return const AuthLoading();
  }

  Future<void> _restoreSession() async {
    final refreshToken = await _tokenStorage.readRefreshToken();
    if (refreshToken == null) {
      state = const AuthUnauthenticated();
      return;
    }
    try {
      final user = await _repository.getCurrentUser();
      final pinEnabled = await _deviceLock.hasPin;
      final biometricEnabled = await _deviceLock.isBiometricEnabled;
      state = (pinEnabled || biometricEnabled) ? AuthLocked(user) : AuthAuthenticated(user);
    } catch (_) {
      // Access token expired and refresh failed too (ApiClient's
      // _AuthInterceptor already attempted one refresh internally) —
      // treat as a clean logout rather than surfacing a raw network error
      // on the splash screen.
      await _tokenStorage.clearTokens();
      state = const AuthUnauthenticated();
    }
  }

  Future<void> login({required String email, required String password, bool rememberMe = false}) async {
    final outcome = await _repository.login(email: email, password: password, rememberMe: rememberMe);
    switch (outcome) {
      case LoginNeedsMfa(:final mfaChallengeToken):
        state = AuthMfaRequired(mfaChallengeToken);
      case LoginSucceeded(:final user):
        await _registerDevice();
        state = AuthAuthenticated(user);
    }
  }

  Future<void> submitMfaChallenge(String code) async {
    final current = state;
    if (current is! AuthMfaRequired) return;
    final user = await _repository.submitMfaChallenge(
      mfaChallengeToken: current.mfaChallengeToken,
      code: code,
    );
    await _registerDevice();
    state = AuthAuthenticated(user);
  }

  Future<void> completeOAuth(String code) async {
    final user = await _repository.exchangeOAuthCode(code);
    await _registerDevice();
    state = AuthAuthenticated(user);
  }

  /// Device Registration (Auth feature spec item): stamps a stable
  /// per-install device ID as the current session's device name context so
  /// `GET /auth/sessions` shows a recognizable entry (e.g. "iPhone 15 Pro —
  /// PentestHub Mobile") rather than a bare user agent string. The backend
  /// derives `SessionSummaryDto.deviceName` from the `User-Agent` header
  /// already sent by Dio; this call additionally registers the FCM push
  /// token for that device once notification permission is granted (see
  /// features/notifications/data/push_registration_service.dart).
  Future<void> _registerDevice() async {
    await _tokenStorage.readOrCreateDeviceId(() => const Uuid().v4());
  }

  Future<void> unlockWithPin(String pin) async {
    final current = state;
    if (current is! AuthLocked) return;
    final valid = await _deviceLock.verifyPin(pin);
    if (valid) state = AuthAuthenticated(current.user);
  }

  Future<bool> unlockWithBiometrics() async {
    final current = state;
    if (current is! AuthLocked) return false;
    final ok = await _deviceLock.authenticateWithBiometrics();
    if (ok) state = AuthAuthenticated(current.user);
    return ok;
  }

  /// Called from the app lifecycle listener on resume, if a lock method is
  /// configured — re-arms [AuthLocked] without touching the network.
  void lockIfConfigured() {
    final current = state;
    if (current is AuthAuthenticated) {
      state = AuthLocked(current.user);
    }
  }

  Future<void> logout() async {
    await _repository.logout();
    state = const AuthUnauthenticated();
  }

  Future<void> refreshCurrentUser() async {
    final current = state;
    if (current is! AuthAuthenticated) return;
    final user = await _repository.getCurrentUser();
    state = AuthAuthenticated(user);
  }
}

/// Convenience read-only accessor used throughout `features/*` for "the
/// current user, or null" without needing to `switch` on [AuthState].
final currentUserProvider = Provider<AppUser?>((ref) {
  final state = ref.watch(authNotifierProvider);
  return switch (state) {
    AuthAuthenticated(:final user) => user,
    AuthLocked(:final user) => user,
    _ => null,
  };
});
