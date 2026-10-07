import '../../../core/network/api_client.dart';
import '../../../core/storage/secure_token_storage.dart';
import '../domain/user.dart';

/// Result of `POST /auth/login` — mirrors packages/shared's
/// `LoginResponseDto = AuthTokensDto | MfaRequiredResponseDto` discriminated
/// union (auth.ts).
sealed class LoginOutcome {
  const LoginOutcome();
}

final class LoginSucceeded extends LoginOutcome {
  const LoginSucceeded(this.user);
  final AppUser user;
}

final class LoginNeedsMfa extends LoginOutcome {
  const LoginNeedsMfa(this.mfaChallengeToken);
  final String mfaChallengeToken;
}

/// All Module 1 Auth HTTP calls, using the exact routes from
/// packages/shared/src/auth-endpoints.ts. OAuth (Google/GitHub) is handled
/// via an in-app WebView flow (see
/// features/auth/presentation/screens/oauth_webview_screen.dart) that
/// intercepts the callback URL and hands the resulting code to
/// [exchangeOAuthCode] — the same `/auth/oauth/exchange` endpoint
/// apps/web's `oauthExchange()` uses (apps/web/lib/api/auth.ts).
class AuthRepository {
  AuthRepository({
    required ApiClient apiClient,
    required SecureTokenStorage tokenStorage,
  })  : _api = apiClient,
        _tokens = tokenStorage;

  final ApiClient _api;
  final SecureTokenStorage _tokens;

  /// [acceptedLegalVersion] is the legal version the user explicitly
  /// accepted on the signup form; the API rejects signup without it.
  Future<void> register({
    required String email,
    required String password,
    required String displayName,
    required String acceptedLegalVersion,
  }) =>
      _api.post<void>(
        '/auth/register',
        body: {
          'email': email,
          'password': password,
          'displayName': displayName,
          'acceptedLegalVersion': acceptedLegalVersion,
        },
        public: true,
      );

  Future<LoginOutcome> login({
    required String email,
    required String password,
    bool rememberMe = false,
  }) async {
    final data = await _api.post<Map<String, dynamic>>(
      '/auth/login',
      body: {'email': email, 'password': password, 'rememberMe': rememberMe},
      public: true,
      decode: (json) => json as Map<String, dynamic>,
    );

    if (data['mfaRequired'] == true) {
      return LoginNeedsMfa(data['mfaChallengeToken'] as String);
    }

    await _persistTokens(data);
    return LoginSucceeded(await getCurrentUser());
  }

  Future<AppUser> submitMfaChallenge({
    required String mfaChallengeToken,
    required String code,
  }) async {
    final data = await _api.post<Map<String, dynamic>>(
      '/auth/mfa/challenge',
      body: {'mfaChallengeToken': mfaChallengeToken, 'code': code},
      public: true,
      decode: (json) => json as Map<String, dynamic>,
    );
    await _persistTokens(data);
    return getCurrentUser();
  }

  Future<AppUser> exchangeOAuthCode(String code) async {
    final data = await _api.post<Map<String, dynamic>>(
      '/auth/oauth/exchange',
      body: {'code': code},
      public: true,
      decode: (json) => json as Map<String, dynamic>,
    );
    await _persistTokens(data);
    return getCurrentUser();
  }

  String oauthStartUrl(String provider) =>
      '${_api.raw.options.baseUrl}/auth/oauth/$provider';

  Future<AppUser> getCurrentUser() => _api.get<AppUser>(
        '/auth/me',
        decode: (json) => AppUser.fromJson(json as Map<String, dynamic>),
      );

  Future<void> logout() async {
    final refreshToken = await _tokens.readRefreshToken();
    try {
      if (refreshToken != null) {
        await _api.post<void>('/auth/logout', body: {'refreshToken': refreshToken});
      }
    } finally {
      await _tokens.clearTokens();
    }
  }

  Future<void> requestPasswordReset(String email) => _api.post<void>(
        '/auth/password/forgot',
        body: {'email': email},
        public: true,
      );

  Future<void> resetPassword({required String token, required String newPassword}) =>
      _api.post<void>(
        '/auth/password/reset',
        body: {'token': token, 'newPassword': newPassword},
        public: true,
      );

  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) =>
      _api.post<void>(
        '/auth/password/change',
        body: {'currentPassword': currentPassword, 'newPassword': newPassword},
      );

  Future<void> verifyEmail(String token) => _api.post<void>(
        '/auth/verify-email',
        body: {'token': token},
        public: true,
      );

  Future<void> resendVerificationEmail(String email) => _api.post<void>(
        '/auth/verify-email/resend',
        body: {'email': email},
        public: true,
      );

  Future<MfaSetup> mfaSetup() => _api.post<MfaSetup>(
        '/auth/mfa/setup',
        decode: (json) => MfaSetup.fromJson(json as Map<String, dynamic>),
      );

  Future<List<String>> mfaConfirm(String code) => _api.post<List<String>>(
        '/auth/mfa/confirm',
        body: {'code': code},
        decode: (json) =>
            ((json as Map<String, dynamic>)['backupCodes'] as List<dynamic>).cast<String>(),
      );

  Future<void> mfaDisable({required String code, required String currentPassword}) =>
      _api.post<void>(
        '/auth/mfa/disable',
        body: {'code': code, 'currentPassword': currentPassword},
      );

  Future<List<DeviceSession>> listSessions() => _api.get<List<DeviceSession>>(
        '/auth/sessions',
        decode: (json) =>
            (json as List<dynamic>).map((e) => DeviceSession.fromJson(e as Map<String, dynamic>)).toList(),
      );

  Future<void> revokeSession(String sessionId) =>
      _api.delete<void>('/auth/sessions/$sessionId');

  /// Remote Logout (Settings > Security) — revokes every session but the
  /// current one, one request per session ID; the backend has no bulk
  /// "revoke all others" endpoint, matching apps/web's Sessions page which
  /// does the same client-side loop.
  Future<void> revokeAllOtherSessions() async {
    final sessions = await listSessions();
    for (final session in sessions.where((s) => !s.current)) {
      await revokeSession(session.id);
    }
  }

  Future<void> _persistTokens(Map<String, dynamic> tokens) => _tokens.writeTokenPair(
        accessToken: tokens['accessToken'] as String,
        refreshToken: tokens['refreshToken'] as String,
      );
}

class MfaSetup {
  const MfaSetup({required this.secret, required this.otpAuthUrl, required this.qrCodeDataUrl});
  final String secret;
  final String otpAuthUrl;
  final String qrCodeDataUrl;

  factory MfaSetup.fromJson(Map<String, dynamic> json) => MfaSetup(
        secret: json['secret'] as String,
        otpAuthUrl: json['otpAuthUrl'] as String,
        qrCodeDataUrl: json['qrCodeDataUrl'] as String,
      );
}
