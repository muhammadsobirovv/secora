import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/config/env.dart';
import '../../../../core/providers/core_providers.dart';
import '../../../../core/router/app_routes.dart';
import '../../../auth/application/auth_notifier.dart';
import '../../../files/presentation/screens/file_manager_screen.dart';
import '../../../voice/application/voice_providers.dart';
import '../../application/settings_notifier.dart';
import '../../data/privacy_mode_repository.dart';
import 'pin_setup_screen.dart';

final privacyModeRepositoryProvider = Provider<PrivacyModeRepository>((ref) {
  return PrivacyModeRepository(apiClient: ref.watch(apiClientProvider));
});

final privacyModeProvider = FutureProvider.autoDispose<AiPrivacyMode>((ref) {
  return ref.watch(privacyModeRepositoryProvider).get();
});

final syncPendingCountProvider = FutureProvider.autoDispose<int>((ref) {
  return ref.watch(syncEngineProvider).pendingCount;
});

final storageUsageProvider = FutureProvider.autoDispose<int>((ref) {
  return ref.watch(fileManagerRepositoryProvider).totalSizeBytes();
});

/// Settings — Theme / Language / Notifications / Security / AI Providers /
/// Voice / Storage / Downloads / Sync / Privacy / Developer Mode.
class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final themeMode = ref.watch(themeModeProvider);
    final handsFree = ref.watch(handsFreeModeProvider);
    final readAloud = ref.watch(readRepliesAloudProvider);
    final pendingSync = ref.watch(syncPendingCountProvider);
    final storageBytes = ref.watch(storageUsageProvider);
    final privacyModeAsync = ref.watch(privacyModeProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        children: [
          ListTile(
            leading: const CircleAvatar(child: Icon(Icons.person)),
            title: Text(user?.displayName ?? ''),
            subtitle: Text(user?.email ?? ''),
          ),
          ListTile(
            leading: const Icon(Icons.business_outlined),
            title: const Text('Workspace'),
            subtitle: const Text('Members, roles, usage'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push(AppRoutes.workspace),
          ),
          ListTile(
            leading: const Icon(Icons.bar_chart_outlined),
            title: const Text('Analytics'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push(AppRoutes.analytics),
          ),
          ListTile(
            leading: const Icon(Icons.menu_book_outlined),
            title: const Text('Knowledge Base'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push(AppRoutes.knowledgeBase),
          ),
          ListTile(
            leading: const Icon(Icons.description_outlined),
            title: const Text('Reports'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push(AppRoutes.reports),
          ),
          const Divider(),

          const _SectionLabel('Appearance'),
          ListTile(
            title: const Text('Theme'),
            trailing: DropdownButton<ThemeMode>(
              value: themeMode,
              items: const [
                DropdownMenuItem(value: ThemeMode.system, child: Text('System')),
                DropdownMenuItem(value: ThemeMode.light, child: Text('Light')),
                DropdownMenuItem(value: ThemeMode.dark, child: Text('Dark')),
              ],
              onChanged: (mode) {
                if (mode != null) ref.read(themeModeProvider.notifier).setThemeMode(mode);
              },
            ),
          ),
          const ListTile(title: Text('Language'), trailing: Text('English (device default)')),

          const Divider(),
          const _SectionLabel('Security'),
          ListTile(
            title: const Text('PIN lock'),
            subtitle: const Text('Set or change your app PIN'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const PinSetupScreen()),
            ),
          ),
          ListTile(
            title: const Text('Active sessions'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push(AppRoutes.sessions),
          ),
          ListTile(
            title: const Text('Sign out of all other devices'),
            onTap: () => ref.read(authRepositoryProvider).revokeAllOtherSessions(),
          ),

          const Divider(),
          const _SectionLabel('AI Providers'),
          ListTile(
            title: const Text('Privacy mode'),
            subtitle: const Text('Controls whether AI calls may use cloud providers'),
            trailing: privacyModeAsync.when(
              loading: () => const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
              error: (_, __) => const Text('—'),
              data: (mode) => DropdownButton<AiPrivacyMode>(
                value: mode,
                items: AiPrivacyMode.values
                    .map((m) => DropdownMenuItem(value: m, child: Text(m.wire)))
                    .toList(),
                onChanged: (m) async {
                  if (m == null) return;
                  await ref.read(privacyModeRepositoryProvider).update(m);
                  ref.invalidate(privacyModeProvider);
                },
              ),
            ),
          ),

          const Divider(),
          const _SectionLabel('Voice'),
          SwitchListTile(
            title: const Text('Hands-free chat'),
            subtitle: const Text('Automatically listen again after each AI reply'),
            value: handsFree,
            onChanged: (_) => ref.read(handsFreeModeProvider.notifier).toggle(),
          ),
          SwitchListTile(
            title: const Text('Read AI responses aloud'),
            value: readAloud,
            onChanged: (_) => ref.read(readRepliesAloudProvider.notifier).toggle(),
          ),

          const Divider(),
          const _SectionLabel('Storage & Sync'),
          ListTile(
            title: const Text('Downloaded files'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push(AppRoutes.files),
          ),
          ListTile(
            title: const Text('Local storage used'),
            trailing: storageBytes.when(
              loading: () => const Text('...'),
              error: (_, __) => const Text('—'),
              data: (bytes) => Text('${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB'),
            ),
          ),
          ListTile(
            title: const Text('Pending sync items'),
            trailing: pendingSync.when(
              loading: () => const Text('...'),
              error: (_, __) => const Text('—'),
              data: (count) => Text('$count'),
            ),
          ),

          const Divider(),
          const _SectionLabel('Privacy'),
          const ListTile(
            title: Text('Screenshot protection'),
            subtitle: Text('Configured per-platform in Security hardening (release builds)'),
          ),

          if (Env.developerModeAvailable) ...[
            const Divider(),
            const _SectionLabel('Developer'),
            ListTile(title: const Text('API base URL'), subtitle: Text(Env.apiBaseUrl)),
          ],

          const Divider(),
          Padding(
            padding: const EdgeInsets.all(16),
            child: OutlinedButton(
              onPressed: () => ref.read(authNotifierProvider.notifier).logout(),
              child: const Text('Sign out'),
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.label);
  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
      child: Text(label, style: Theme.of(context).textTheme.labelLarge?.copyWith(color: Theme.of(context).colorScheme.primary)),
    );
  }
}
