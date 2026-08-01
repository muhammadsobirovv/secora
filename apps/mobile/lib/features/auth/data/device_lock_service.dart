import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:local_auth/local_auth.dart';

import '../../../core/error/app_exception.dart';
import '../../../core/storage/secure_token_storage.dart';

/// Face ID / Fingerprint + PIN Lock (Auth feature) — this is a *device
/// unlock gate* layered in front of an already-valid token pair, not a
/// second authentication factor against the backend (that's MFA, handled
/// entirely server-side via `/auth/mfa/*`). A user who passes this gate is
/// simply proving they're the same person who logged in, to a device
/// screen — exactly like a banking app's app-open lock.
class DeviceLockService {
  DeviceLockService({
    required SecureTokenStorage tokenStorage,
    LocalAuthentication? localAuth,
  })  : _tokens = tokenStorage,
        _localAuth = localAuth ?? LocalAuthentication();

  final SecureTokenStorage _tokens;
  final LocalAuthentication _localAuth;

  Future<bool> get isBiometricSupported async {
    try {
      final canCheck = await _localAuth.canCheckBiometrics;
      final isDeviceSupported = await _localAuth.isDeviceSupported();
      return canCheck && isDeviceSupported;
    } catch (_) {
      return false;
    }
  }

  Future<List<BiometricType>> get availableBiometrics =>
      _localAuth.getAvailableBiometrics();

  Future<bool> get isBiometricEnabled => _tokens.readBiometricEnabled();

  Future<void> setBiometricEnabled(bool enabled) =>
      _tokens.writeBiometricEnabled(enabled);

  Future<bool> get hasPin async => (await _tokens.readPinHash()) != null;

  Future<void> setPin(String pin) async {
    final hash = _hashPin(pin);
    await _tokens.writePinHash(hash);
  }

  Future<void> clearPin() => _tokens.clearPin();

  Future<bool> verifyPin(String pin) async {
    final stored = await _tokens.readPinHash();
    if (stored == null) return false;
    return stored == _hashPin(pin);
  }

  String _hashPin(String pin) => sha256.convert(utf8.encode('pentesthub_pin_v1:$pin')).toString();

  /// Prompts Face ID / Fingerprint (or the device's own PIN/pattern as a
  /// system-level fallback, via [BiometricOnly] = false). Throws
  /// [AppException] with [AppErrorCodes.biometricUnavailable] rather than
  /// returning false when the platform can't present the prompt at all
  /// (no enrolled biometrics, disabled by MDM policy, simulator) — the
  /// caller (DeviceLockNotifier) uses that to fall back to the app's own
  /// PIN entry screen instead of silently retrying.
  Future<bool> authenticateWithBiometrics({String reason = 'Unlock PentestHub AI'}) async {
    if (!await isBiometricSupported) {
      throw const AppException(
        code: AppErrorCodes.biometricUnavailable,
        message: 'Biometric authentication is not available on this device.',
        statusCode: 0,
      );
    }
    try {
      return await _localAuth.authenticate(
        localizedReason: reason,
        options: const AuthenticationOptions(biometricOnly: true, stickyAuth: true),
      );
    } catch (_) {
      throw const AppException(
        code: AppErrorCodes.biometricUnavailable,
        message: 'Biometric authentication failed or was cancelled.',
        statusCode: 0,
      );
    }
  }
}
