import '../../../core/network/api_client.dart';

/// In-app Notifications — `BUGBOUNTY_NOTIFICATION_ENDPOINTS`
/// (bugbounty-endpoints.ts). Push delivery (FCM) is
/// `PushNotificationService`'s job (features/notifications/data/
/// push_notification_service.dart); this repository is the notification
/// *inbox* both push taps and the bell icon read from.
class NotificationRepository {
  NotificationRepository({required ApiClient apiClient}) : _api = apiClient;
  final ApiClient _api;

  Future<List<AppNotification>> list() => _api.get<List<AppNotification>>(
        '/bugbounty/notifications',
        decode: (json) =>
            (json as List<dynamic>).map((e) => AppNotification.fromJson(e as Map<String, dynamic>)).toList(),
      );

  Future<void> markRead(String id) => _api.post<void>('/bugbounty/notifications/$id/read');

  Future<void> markAllRead() => _api.post<void>('/bugbounty/notifications/read-all');
}

/// Kinds mirror the spec's notification trigger list: Job Completion,
/// Recon/Scanner Finished, New Finding, Assignment, Mention, Report
/// Generated, AI Finished.
class AppNotification {
  const AppNotification({
    required this.id,
    required this.kind,
    required this.title,
    required this.body,
    required this.read,
    required this.createdAt,
  });

  final String id;
  final String kind;
  final String title;
  final String body;
  final bool read;
  final DateTime createdAt;

  factory AppNotification.fromJson(Map<String, dynamic> json) => AppNotification(
        id: json['id'] as String,
        kind: json['kind'] as String? ?? json['type'] as String? ?? 'GENERAL',
        title: json['title'] as String? ?? '',
        body: json['body'] as String? ?? json['message'] as String? ?? '',
        read: json['read'] as bool? ?? json['readAt'] != null,
        createdAt: DateTime.parse(json['createdAt'] as String),
      );
}
