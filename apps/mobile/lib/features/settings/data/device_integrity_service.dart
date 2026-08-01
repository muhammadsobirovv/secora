import 'package:flutter/foundation.dart';
import 'package:flutter_jailbreak_detection/flutter_jailbreak_detection.dart';

/// Security hardening — Jailbreak/Root Detection. Runs once at cold start
/// (see `main.dart`) and again whenever the Security settings section is
/// opened. This is a *risk signal*, not an unbypassable gate — root/
/// jailbreak detection is inherently defeatable by a sufficiently
/// determined attacker with device access, so the app degrades to a
/// dismissible warning banner (surfaced via [DeviceIntegrityStatus]) rather
/// than a hard refusal-to-run, consistent with how every mainstream
/// banking app actually behaves today (a hard block just pushes users to a
/// less-safe unofficial build).
class DeviceIntegrityService {
  Future<DeviceIntegrityStatus> check() async {
    try {
      final jailbroken = await FlutterJailbreakDetection.jailbroken;
      final developerMode = await FlutterJailbreakDetection.developerMode;
      return DeviceIntegrityStatus(compromised: jailbroken, developerModeEnabled: developerMode);
    } catch (e) {
      // Detection itself failed (unsupported platform/emulator edge case) —
      // fail open rather than block legitimate users; log for visibility.
      debugPrint('DeviceIntegrityService: check failed ($e)');
      return const DeviceIntegrityStatus(compromised: false, developerModeEnabled: false);
    }
  }
}

class DeviceIntegrityStatus {
  const DeviceIntegrityStatus({required this.compromised, required this.developerModeEnabled});
  final bool compromised;
  final bool developerModeEnabled;
}
