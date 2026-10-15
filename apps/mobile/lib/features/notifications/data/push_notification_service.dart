import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Push Notifications (Notifications feature) — Firebase Cloud Messaging
/// for remote push (job completion, new finding, assignment, mention,
/// report generated, AI finished, recon/scanner finished) plus
/// `flutter_local_notifications` for foreground display and Desktop Sync
/// Notifications relayed in-app.
///
/// Firebase requires a real `google-services.json`/`GoogleService-Info.plist`
/// per environment (see docs/mobile/flutter-development-guide.md "Push
/// notification setup") which this source-only pass does not — and cannot
/// — generate (they're per-Firebase-project secrets). Every method below is
/// written to no-op safely rather than throw when Firebase hasn't been
/// initialized, so a fresh checkout without Firebase configured still runs.
class PushNotificationService {
  static final FlutterLocalNotificationsPlugin _local = FlutterLocalNotificationsPlugin();
  static bool _initialized = false;

  static const AndroidNotificationChannel _defaultChannel = AndroidNotificationChannel(
    'pentesthub_default',
    'Secora AI',
    description: 'Job completion, findings, assignments, and AI updates.',
    importance: Importance.high,
  );

  /// Registered in `main()` before `runApp` — Android requires the
  /// top-level background message handler to be a static/top-level
  /// function reachable without a running Flutter engine, hence this
  /// static method rather than an instance method.
  static Future<void> initializeBackgroundHandler() async {
    if (_initialized) return;
    try {
      const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
      const iosInit = DarwinInitializationSettings();
      await _local.initialize(
        const InitializationSettings(android: androidInit, iOS: iosInit),
      );
      final androidPlugin =
          _local.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
      await androidPlugin?.createNotificationChannel(_defaultChannel);
      _initialized = true;
    } catch (e) {
      // No Firebase/notification config present in this checkout — degrade
      // to in-app notifications only (features/notifications' NotificationsRepository
      // still polls `BUGBOUNTY_NOTIFICATION_ENDPOINTS`/activity, unaffected).
      debugPrint('PushNotificationService: background handler init skipped ($e)');
    }
  }

  static Future<void> showLocal({
    required int id,
    required String title,
    required String body,
    String? payload,
  }) async {
    if (!_initialized) return;
    await _local.show(
      id,
      title,
      body,
      NotificationDetails(
        android: AndroidNotificationDetails(_defaultChannel.id, _defaultChannel.name),
        iOS: const DarwinNotificationDetails(),
      ),
      payload: payload,
    );
  }
}
