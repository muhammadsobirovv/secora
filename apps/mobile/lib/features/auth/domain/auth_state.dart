import 'user.dart';

/// The app-wide authentication state — every screen behind
/// `core/router/app_router.dart`'s auth guard reads this via
/// `authNotifierProvider` to decide login vs. app-shell vs. MFA-challenge
/// vs. PIN-lock routing. A plain Dart 3 sealed class rather than a
/// `@freezed` union: no codegen required, exhaustive `switch` matching
/// works identically — see docs/mobile/mobile-architecture-guide.md
/// "Why plain sealed classes instead of Freezed for state unions".
sealed class AuthState {
  const AuthState();
}

/// Cold-start default, and the state after logout / session-expiry.
final class AuthUnauthenticated extends AuthState {
  const AuthUnauthenticated();
}

/// Set right after a successful `POST /auth/login` when the account has MFA
/// enabled (mirrors `MfaRequiredResponseDto`) — the UI must show the MFA
/// challenge screen before a token pair exists.
final class AuthMfaRequired extends AuthState {
  const AuthMfaRequired(this.mfaChallengeToken);
  final String mfaChallengeToken;
}

/// Tokens exist and the user profile has been loaded, but the device's PIN
/// lock (Settings > Security) is enabled and hasn't been unlocked yet this
/// app session (task: Auth — PIN Lock / Biometric Authentication).
final class AuthLocked extends AuthState {
  const AuthLocked(this.user);
  final AppUser user;
}

final class AuthAuthenticated extends AuthState {
  const AuthAuthenticated(this.user);
  final AppUser user;
}

/// A transient state while the stored refresh token is being validated on
/// cold start — the splash screen renders while this is current.
final class AuthLoading extends AuthState {
  const AuthLoading();
}
