import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Wraps the platform keychain (iOS Keychain / Android Keystore-backed
/// EncryptedSharedPreferences) for the two secrets that must never touch
/// Hive/sqflite plaintext storage: the refresh token and the optional
/// device PIN hash. Access/refresh token pair mirrors apps/web's
/// `persistRefreshToken`/`getStoredRefreshToken` (apps/web/lib/api/client.ts)
/// — same two keys, same rotate-on-refresh contract, different storage
/// backend (secure keychain here vs. localStorage there, since a mobile
/// device's local storage is a much higher-value target for extraction).
class SecureTokenStorage {
  SecureTokenStorage({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
              iOptions: IOSOptions(
                accessibility: KeychainAccessibility.first_unlock_this_device,
              ),
            );

  final FlutterSecureStorage _storage;

  static const _accessTokenKey = 'pentesthub_access_token';
  static const _refreshTokenKey = 'pentesthub_refresh_token';
  static const _pinHashKey = 'pentesthub_pin_hash';
  static const _deviceIdKey = 'pentesthub_device_id';
  static const _biometricEnabledKey = 'pentesthub_biometric_enabled';

  Future<String?> readAccessToken() => _storage.read(key: _accessTokenKey);

  Future<void> writeAccessToken(String token) =>
      _storage.write(key: _accessTokenKey, value: token);

  Future<String?> readRefreshToken() => _storage.read(key: _refreshTokenKey);

  Future<void> writeRefreshToken(String token) =>
      _storage.write(key: _refreshTokenKey, value: token);

  Future<void> writeTokenPair({
    required String accessToken,
    required String refreshToken,
  }) async {
    await Future.wait([
      writeAccessToken(accessToken),
      writeRefreshToken(refreshToken),
    ]);
  }

  Future<void> clearTokens() async {
    await Future.wait([
      _storage.delete(key: _accessTokenKey),
      _storage.delete(key: _refreshTokenKey),
    ]);
  }

  Future<String?> readPinHash() => _storage.read(key: _pinHashKey);

  Future<void> writePinHash(String hash) =>
      _storage.write(key: _pinHashKey, value: hash);

  Future<void> clearPin() => _storage.delete(key: _pinHashKey);

  Future<bool> readBiometricEnabled() async =>
      (await _storage.read(key: _biometricEnabledKey)) == 'true';

  Future<void> writeBiometricEnabled(bool enabled) =>
      _storage.write(key: _biometricEnabledKey, value: enabled.toString());

  /// A stable per-install identifier used for Device Registration (Module 1
  /// session/device management — matches `SessionSummaryDto.deviceName`'s
  /// device row) and as the FCM registration token's owning device key.
  /// Generated once on first launch, never rotated (rotating it would orphan
  /// the backend's device/session row on every app reinstall-free run).
  Future<String> readOrCreateDeviceId(String Function() generate) async {
    final existing = await _storage.read(key: _deviceIdKey);
    if (existing != null) return existing;
    final created = generate();
    await _storage.write(key: _deviceIdKey, value: created);
    return created;
  }

  /// Full wipe — used by Settings > Security > "Sign out of all devices"
  /// (Remote Logout) and by jailbreak/root-detection lockdown.
  Future<void> wipeAll() => _storage.deleteAll();
}
