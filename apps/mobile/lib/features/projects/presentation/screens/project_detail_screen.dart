import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../targets/application/target_providers.dart';
import '../../../targets/domain/target.dart';
import '../../application/project_providers.dart';

/// Project detail — Tags/Members/Activity Timeline live here alongside the
/// Targets tab; Project Search lives at the list level (ProjectsScreen).
class ProjectDetailScreen extends ConsumerWidget {
  const ProjectDetailScreen({super.key, required this.projectId});
  final String projectId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final projectAsync = ref.watch(projectDetailProvider(projectId));

    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: projectAsync.maybeWhen(data: (p) => Text(p.name), orElse: () => const Text('Project')),
          bottom: const TabBar(tabs: [
            Tab(text: 'Overview'),
            Tab(text: 'Targets'),
            Tab(text: 'Activity'),
          ]),
        ),
        body: projectAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(child: Text('Could not load project: $e')),
          data: (project) => TabBarView(
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(project.description ?? 'No description', style: const TextStyle(color: AppColors.textSecondary)),
                    const SizedBox(height: 16),
                    Wrap(
                      spacing: 8,
                      children: project.tags.map((t) => Chip(label: Text(t.name))).toList(),
                    ),
                  ],
                ),
              ),
              _TargetsTab(projectId: projectId),
              const Center(child: Text('Activity timeline')),
            ],
          ),
        ),
      ),
    );
  }
}

class _TargetsTab extends ConsumerWidget {
  const _TargetsTab({required this.projectId});
  final String projectId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final targetsAsync = ref.watch(projectTargetsProvider(projectId));
    return Scaffold(
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showAddTargetSheet(context, ref),
        child: const Icon(Icons.add),
      ),
      body: targetsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Could not load targets: $e')),
        data: (targets) => targets.isEmpty
            ? const Center(child: Text('No targets yet'))
            : ListView.builder(
                itemCount: targets.length,
                itemBuilder: (context, index) {
                  final t = targets[index];
                  return ListTile(
                    leading: const Icon(Icons.adjust, color: AppColors.primary),
                    title: Text(t.name ?? t.value),
                    subtitle: Text('${t.type.wire} · ${t.environment}'),
                    trailing: Chip(label: Text(t.scopeStatus.wire), visualDensity: VisualDensity.compact),
                  );
                },
              ),
      ),
    );
  }

  void _showAddTargetSheet(BuildContext context, WidgetRef ref) {
    final controller = TextEditingController();
    TargetType selectedType = TargetType.domain;
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) => Padding(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 20,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('Add target', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
              const SizedBox(height: 12),
              DropdownButtonFormField<TargetType>(
                initialValue: selectedType,
                items: TargetType.values
                    .map((t) => DropdownMenuItem(value: t, child: Text(t.wire)))
                    .toList(),
                onChanged: (v) => setSheetState(() => selectedType = v ?? selectedType),
              ),
              const SizedBox(height: 12),
              TextField(controller: controller, decoration: const InputDecoration(labelText: 'Value (e.g. example.com)')),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () async {
                  if (controller.text.trim().isEmpty) return;
                  await ref.read(targetRepositoryProvider).createTarget(
                        projectId,
                        type: selectedType,
                        value: controller.text.trim(),
                      );
                  ref.invalidate(projectTargetsProvider(projectId));
                  if (ctx.mounted) Navigator.of(ctx).pop();
                },
                child: const Text('Add'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
