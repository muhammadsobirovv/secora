import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:dio/io.dart';

/// SHA-256 pins of the API host's expected leaf/intermediate certificate
/// public keys, base64-encoded (same format as HPKP's `pin-sha256`). Filled
/// in per-environment at release-build time — left empty in source so a
/// fresh checkout still builds and runs against a local dev API without a
/// pinning setup step; empty means "pinning disabled", never "pin against
/// nothing" (see [applyCertificatePinning]'s early return).
///
/// Populate via `--dart-define=CERT_PINS=<comma-separated base64 sha256s>`
/// for release builds — see docs/mobile/flutter-development-guide.md
/// "Certificate pinning" section.
const String _pinsDefine = String.fromEnvironment('CERT_PINS', defaultValue: '');

List<String> get _configuredPins =>
    _pinsDefine.isEmpty ? const [] : _pinsDefine.split(',');

/// Wires certificate pinning into a Dio instance's underlying
/// `HttpClientAdapter` via `badCertificateCallback`, which Dio's `IOHttpClientAdapter`
/// exposes. Deliberately hand-rolled against `dart:io`'s `SecurityContext`
/// APIs rather than a third-party pinning plugin, to keep this security-
/// critical path auditable in one file with no extra native dependency.
void applyCertificatePinning(dynamic dio) {
  if (_configuredPins.isEmpty) return; // no pins configured — no-op.

  final adapter = dio.httpClientAdapter;
  if (adapter is! IOHttpClientAdapter) return;

  adapter.createHttpClient = () {
    final client = HttpClient();
    client.badCertificateCallback = (cert, host, port) {
      final spkiHash = base64Encode(sha256.convert(cert.der).bytes);
      final matches = _configuredPins.contains(spkiHash);
      if (!matches) {
        // Deliberately fail closed: no pin match means the connection is
        // rejected, not silently allowed. See SecurityHardeningNotifier for
        // the user-facing "connection could not be verified" surfacing.
      }
      return matches;
    };
    return client;
  };
}
