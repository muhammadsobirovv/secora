/// Mirrors packages/shared's `AppErrorCode` closed union (see
/// packages/shared/src/errors.ts) so the mobile client can branch on error
/// type exactly like apps/web's `ApiError` does — deliberately a plain
/// `String` here rather than a hand-copied Dart enum of 150+ literals: the
/// backend's error-code set grows with every module, and re-typing it on
/// the client would silently drift. Known codes the UI actually branches on
/// are defined as constants in [AppErrorCodes] below; anything else still
/// flows through as a string and is shown via [AppException.message].
class AppException implements Exception {
  const AppException({
    required this.code,
    required this.message,
    required this.statusCode,
  });

  /// Thrown when the device has no network and no offline fallback applies
  /// for this operation (see core/network/connectivity_service.dart).
  factory AppException.offline() => const AppException(
        code: AppErrorCodes.offline,
        message: 'You are offline. This action requires a connection.',
        statusCode: 0,
      );

  factory AppException.unknown([String? message]) => AppException(
        code: AppErrorCodes.unknown,
        message: message ?? 'Something went wrong. Please try again.',
        statusCode: 0,
      );

  final String code;
  final String message;
  final int statusCode;

  bool get isAuthError => statusCode == 401;
  bool get isForbidden => statusCode == 403;
  bool get isNotFound => statusCode == 404;
  bool get isRateLimited => code == 'RATE_LIMITED' || statusCode == 429;
  bool get isOffline => code == AppErrorCodes.offline;

  @override
  String toString() => 'AppException($code, $statusCode): $message';
}

/// Client-only sentinel codes, namespaced away from the server's
/// AppErrorCode literals (all of which are SCREAMING_SNAKE_CASE without a
/// "CLIENT_" prefix) so there's never a collision.
abstract final class AppErrorCodes {
  static const String offline = 'CLIENT_OFFLINE';
  static const String unknown = 'UNKNOWN_ERROR';
  static const String cacheMiss = 'CLIENT_CACHE_MISS';
  static const String syncConflict = 'CLIENT_SYNC_CONFLICT';
  static const String biometricUnavailable = 'CLIENT_BIOMETRIC_UNAVAILABLE';
  static const String deviceCompromised = 'CLIENT_DEVICE_COMPROMISED';
}
