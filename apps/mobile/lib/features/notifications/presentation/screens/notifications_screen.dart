import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/providers/core_providers.dart';
import '../../data/notification_repository.dart';

final notificationRepositoryProvider = Provider<NotificationRepository>((ref) {
  return NotificationRepository(apiClient: ref.watch(apiClientProvider));
});

final notificationListProvider = FutureProvider.autoDispose<List<AppNotification>>((ref) {
  return ref.watch(notificationRepositoryProvider).list();
});

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notificationsAsync = ref.watch(notificationListProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          TextButton(
            onPressed: () async {
              await ref.read(notificationRepositoryProvider).markAllRead();
              ref.invalidate(notificationListProvider);
            },
            child: const Text('Mark all read'),
          ),
        ],
      ),
      body: notificationsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Could not load notifications: $e')),
        data: (items) => items.isEmpty
            ? const Center(child: Text('No notifications'))
            : RefreshIndicator(
                onRefresh: () async => ref.invalidate(notificationListProvider),
                child: ListView.separated(
                  itemCount: items.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (context, index) {
                    final n = items[index];
                    return ListTile(
                      leading: Icon(
                        n.read ? Icons.notifications_none : Icons.notifications_active,
                        color: n.read ? null : Theme.of(context).colorScheme.primary,
                      ),
                      title: Text(n.title),
                      subtitle: Text(n.body, maxLines: 2, overflow: TextOverflow.ellipsis),
                      trailing: Text(n.createdAt.toLocal().toString().substring(0, 16)),
                      onTap: () async {
                        if (!n.read) {
                          await ref.read(notificationRepositoryProvider).markRead(n.id);
                          ref.invalidate(notificationListProvider);
                        }
                      },
                    );
                  },
                ),
              ),
      ),
    );
  }
}
