import 'package:flutter_test/flutter_test.dart';
import 'package:pentesthub_mobile/core/error/app_exception.dart';
import 'package:pentesthub_mobile/core/error/result.dart';

void main() {
  group('Result', () {
    test('Ok exposes value and null error', () {
      const result = Result<int>.ok(42);
      expect(result.isOk, isTrue);
      expect(result.isErr, isFalse);
      expect(result.valueOrNull, 42);
      expect(result.errorOrNull, isNull);
    });

    test('Err exposes error and null value', () {
      final error = AppException.unknown('boom');
      final result = Result<int>.err(error);
      expect(result.isOk, isFalse);
      expect(result.isErr, isTrue);
      expect(result.valueOrNull, isNull);
      expect(result.errorOrNull, error);
    });

    test('fold dispatches to the matching branch', () {
      const ok = Result<int>.ok(5);
      final err = Result<int>.err(AppException.offline());

      expect(ok.fold((v) => 'ok:$v', (e) => 'err:${e.code}'), 'ok:5');
      expect(err.fold((v) => 'ok:$v', (e) => 'err:${e.code}'), 'err:${AppErrorCodes.offline}');
    });

    test('map transforms Ok and passes through Err unchanged', () {
      const ok = Result<int>.ok(2);
      final mappedOk = ok.map((v) => v * 10);
      expect(mappedOk.valueOrNull, 20);

      final error = AppException.unknown();
      final err = Result<int>.err(error);
      final mappedErr = err.map((v) => v * 10);
      expect(mappedErr.errorOrNull, error);
    });
  });

  group('guardResult', () {
    test('wraps a thrown AppException into Result.err', () async {
      final result = await guardResult<int>(() async => throw AppException.offline());
      expect(result.isErr, isTrue);
      expect(result.errorOrNull!.isOffline, isTrue);
    });

    test('wraps a successful call into Result.ok', () async {
      final result = await guardResult<int>(() async => 7);
      expect(result.valueOrNull, 7);
    });
  });

  group('AppException', () {
    test('isAuthError / isForbidden / isNotFound derive from statusCode', () {
      const unauthorized = AppException(code: 'X', message: 'x', statusCode: 401);
      const forbidden = AppException(code: 'X', message: 'x', statusCode: 403);
      const notFound = AppException(code: 'X', message: 'x', statusCode: 404);

      expect(unauthorized.isAuthError, isTrue);
      expect(forbidden.isForbidden, isTrue);
      expect(notFound.isNotFound, isTrue);
    });

    test('isRateLimited matches either the code or HTTP 429', () {
      const byCode = AppException(code: 'RATE_LIMITED', message: 'x', statusCode: 400);
      const byStatus = AppException(code: 'OTHER', message: 'x', statusCode: 429);
      expect(byCode.isRateLimited, isTrue);
      expect(byStatus.isRateLimited, isTrue);
    });
  });
}
