import 'dart:async';

import 'package:dio/dio.dart';
import 'package:logging/logging.dart';

import '../config/env.dart';
import '../error/app_exception.dart';
import '../storage/secure_token_storage.dart';
import 'certificate_pinning.dart';
import 'connectivity_service.dart';

final _log = Logger('ApiClient');

/// Thin envelope-aware HTTP client wrapping Dio, mirroring
/// apps/web/lib/api/client.ts's `apiFetch<T>` contract: every backend
/// response is `{success:true,data:T}` or `{statusCode,code,message}` (see
/// packages/shared/src/api-response.ts) — this class is the one place that
/// unwraps that envelope, attaches the bearer token, and coalesces
/// concurrent 401s into a single `/auth/refresh` call, exactly like the
/// web client's `refreshAccessToken()` does with its module-level
/// `refreshPromise`.
///
/// Every `features/*/data/*_repository_impl.dart` depends on this instead
/// of touching Dio directly, so the auth/refresh/offline/pinning behavior
/// is identical across every feature.
class ApiClient {
  ApiClient({
    required SecureTokenStorage tokenStorage,
    required ConnectivityService connectivity,
    this.onSessionExpired,
  })  : _tokenStorage = tokenStorage,
        _connectivity = connectivity {
    _dio = Dio(
      BaseOptions(
        baseUrl: Env.apiBaseUrl,
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 30),
      ),
    );
    applyCertificatePinning(_dio);
    _dio.interceptors.add(_AuthInterceptor(this));
    if (!Env.isProduction) {
      _dio.interceptors.add(
        LogInterceptor(requestBody: false, responseBody: false, logPrint: _log.fine),
      );
    }
  }

  late final Dio _dio;
  final SecureTokenStorage _tokenStorage;
  final ConnectivityService _connectivity;

  /// Invoked when refresh itself fails (refresh token missing/expired/
  /// revoked) — the app-level auth notifier clears its session and the
  /// router redirects to /login. Kept as a callback instead of a direct
  /// import so `core/` never depends on `features/auth/`.
  final FutureOr<void> Function()? onSessionExpired;

  Dio get raw => _dio;

  Future<T> get<T>(
    String path, {
    T Function(dynamic json)? decode,
    Map<String, dynamic>? queryParameters,
    bool public = false,
    bool requiresConnectivity = true,
  }) =>
      _request<T>(
        () => _dio.get<dynamic>(path, queryParameters: queryParameters),
        decode: decode,
        public: public,
        requiresConnectivity: requiresConnectivity,
      );

  Future<T> post<T>(
    String path, {
    Object? body,
    T Function(dynamic json)? decode,
    bool public = false,
    bool requiresConnectivity = true,
  }) =>
      _request<T>(
        () => _dio.post<dynamic>(path, data: body),
        decode: decode,
        public: public,
        requiresConnectivity: requiresConnectivity,
      );

  Future<T> patch<T>(
    String path, {
    Object? body,
    T Function(dynamic json)? decode,
    bool requiresConnectivity = true,
  }) =>
      _request<T>(
        () => _dio.patch<dynamic>(path, data: body),
        decode: decode,
        requiresConnectivity: requiresConnectivity,
      );

  Future<T> delete<T>(
    String path, {
    T Function(dynamic json)? decode,
    bool requiresConnectivity = true,
  }) =>
      _request<T>(
        () => _dio.delete<dynamic>(path),
        decode: decode,
        requiresConnectivity: requiresConnectivity,
      );

  Future<T> _request<T>(
    Future<Response<dynamic>> Function() call, {
    T Function(dynamic json)? decode,
    bool public = false,
    bool requiresConnectivity = true,
  }) async {
    if (requiresConnectivity && !_connectivity.isOnline) {
      throw AppException.offline();
    }
    try {
      final response = await call();
      final body = response.data;
      if (response.statusCode == 204 || body == null) {
        return decode == null ? null as T : decode(null);
      }
      if (body is Map<String, dynamic> && body['success'] == true) {
        final data = body['data'];
        return decode == null ? data as T : decode(data);
      }
      throw _errorFromBody(body, response.statusCode ?? 500);
    } on DioException catch (e) {
      if (e.response != null) {
        throw _errorFromBody(e.response!.data, e.response!.statusCode ?? 500);
      }
      if (e.type == DioExceptionType.connectionError ||
          e.type == DioExceptionType.connectionTimeout) {
        throw AppException.offline();
      }
      throw AppException.unknown(e.message);
    }
  }

  AppException _errorFromBody(dynamic body, int statusCode) {
    if (body is Map<String, dynamic>) {
      return AppException(
        code: (body['code'] as String?) ?? AppErrorCodes.unknown,
        message: (body['message'] as String?) ?? 'Something went wrong.',
        statusCode: statusCode,
      );
    }
    return AppException(
      code: AppErrorCodes.unknown,
      message: 'Something went wrong.',
      statusCode: statusCode,
    );
  }
}

/// Attaches `Authorization: Bearer <accessToken>` to every non-public
/// request and, on a 401, coalesces concurrent refresh attempts into one
/// `/auth/refresh` call before retrying the original request exactly once
/// — same shape as apps/web's `refreshPromise` module-level coalescing, just
/// expressed as a Dio interceptor instead of a fetch wrapper.
class _AuthInterceptor extends Interceptor {
  _AuthInterceptor(this._client);

  final ApiClient _client;
  static Future<String?>? _refreshInFlight;

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final isPublic = options.extra['public'] == true;
    if (!isPublic) {
      final token = await _client._tokenStorage.readAccessToken();
      if (token != null) {
        options.headers['Authorization'] = 'Bearer $token';
      }
    }
    handler.next(options);
  }

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    final isPublic = err.requestOptions.extra['public'] == true;
    final alreadyRetried = err.requestOptions.extra['_retried'] == true;

    if (err.response?.statusCode != 401 || isPublic || alreadyRetried) {
      handler.next(err);
      return;
    }

    final newToken = await _refresh();
    if (newToken == null) {
      await _client.onSessionExpired?.call();
      handler.next(err);
      return;
    }

    try {
      final retryOptions = err.requestOptions
        ..headers['Authorization'] = 'Bearer $newToken'
        ..extra['_retried'] = true;
      final response = await _client._dio.fetch<dynamic>(retryOptions);
      handler.resolve(response);
    } on DioException catch (retryError) {
      handler.next(retryError);
    }
  }

  Future<String?> _refresh() {
    return _refreshInFlight ??= _doRefresh().whenComplete(() {
      _refreshInFlight = null;
    });
  }

  Future<String?> _doRefresh() async {
    final refreshToken = await _client._tokenStorage.readRefreshToken();
    if (refreshToken == null) return null;
    try {
      final response = await _client._dio.post<dynamic>(
        '/auth/refresh',
        data: {'refreshToken': refreshToken},
        options: Options(extra: {'public': true}),
      );
      final body = response.data;
      if (body is Map<String, dynamic> && body['success'] == true) {
        final data = body['data'] as Map<String, dynamic>;
        final accessToken = data['accessToken'] as String;
        final newRefreshToken = data['refreshToken'] as String;
        await _client._tokenStorage.writeTokenPair(
          accessToken: accessToken,
          refreshToken: newRefreshToken,
        );
        return accessToken;
      }
    } on DioException {
      // Refresh token itself is invalid/expired/revoked — fall through to
      // clearing the session below.
    }
    await _client._tokenStorage.clearTokens();
    return null;
  }
}
