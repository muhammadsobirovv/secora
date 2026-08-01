import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../application/auth_notifier.dart';
import '../../domain/user.dart';

final sessionsProvider = FutureProvider.autoDispose<List<DeviceSession>>((ref) {
  return ref.watch(authRepositoryProvider).listSessions();
});

/// Settings > Security > Sessions — Session Management + Remote Logout.
class SessionsScreen extends ConsumerWidget {
  const SessionsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sessionsAsync = ref.watch(sessionsProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Active sessions'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Sign out of all other devices',
            onPressed: () async {
              await ref.read(authRepositoryProvider).revokeAllOtherSessions();
              ref.invalidate(sessionsProvider);
            },
          ),
        ],
      ),
      body: sessionsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Failed to load sessions: $e')),
        data: (sessions) => ListView.separated(
          itemCount: sessions.length,
          separatorBuilder: (_, __) => const Divider(height: 1),
          itemBuilder: (context, index) {
            final s = sessions[index];
            return ListTile(
              leading: Icon(s.current ? Icons.smartphone : Icons.devices_other),
              title: Text(s.deviceName),
              subtitle: Text('${s.ipAddress} · last active ${s.lastActiveAt.toLocal()}'),
              trailing: s.current
                  ? const Chip(label: Text('This device'))
                  : IconButton(
                      icon: const Icon(Icons.delete_outline),
                      onPressed: () async {
                        await ref.read(authRepositoryProvider).revokeSession(s.id);
                        ref.invalidate(sessionsProvider);
                      },
                    ),
            );
          },
        ),
      ),
    );
  }
}
