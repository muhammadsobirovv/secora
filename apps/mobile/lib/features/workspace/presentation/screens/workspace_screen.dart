import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/providers/core_providers.dart';
import '../../../dashboard/application/dashboard_providers.dart';
import '../../data/workspace_repository.dart';

final workspaceRepositoryProvider = Provider<WorkspaceRepository>((ref) {
  return WorkspaceRepository(apiClient: ref.watch(apiClientProvider));
});

final workspaceInfoProvider = FutureProvider.autoDispose<WorkspaceInfo>((ref) {
  return ref.watch(workspaceRepositoryProvider).get();
});

final workspaceMembersProvider = FutureProvider.autoDispose<List<WorkspaceMember>>((ref) {
  return ref.watch(workspaceRepositoryProvider).listMembers();
});

class WorkspaceScreen extends ConsumerWidget {
  const WorkspaceScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final infoAsync = ref.watch(workspaceInfoProvider);
    final membersAsync = ref.watch(workspaceMembersProvider);
    final summaryAsync = ref.watch(dashboardSummaryProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Workspace')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          infoAsync.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Text('$e'),
            data: (info) => Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(info.name, style: Theme.of(context).textTheme.headlineSmall),
                if (info.description != null) Text(info.description!),
              ],
            ),
          ),
          const SizedBox(height: 20),
          Text('Usage', style: Theme.of(context).textTheme.titleMedium),
          summaryAsync.when(
            loading: () => const LinearProgressIndicator(),
            error: (_, __) => const SizedBox.shrink(),
            data: (s) => Wrap(spacing: 16, children: [
              Text('${s.totalProjects} projects'),
              Text('${s.totalFindings} findings'),
              Text('${s.totalReports} reports'),
            ]),
          ),
          const SizedBox(height: 20),
          Text('Members', style: Theme.of(context).textTheme.titleMedium),
          membersAsync.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Text('$e'),
            data: (members) => Column(
              children: members
                  .map((m) => ListTile(
                        leading: const CircleAvatar(child: Icon(Icons.person)),
                        title: Text(m.userId),
                        trailing: Chip(label: Text(m.role)),
                      ))
                  .toList(),
            ),
          ),
        ],
      ),
    );
  }
}
