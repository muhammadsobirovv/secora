import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/app_routes.dart';
import '../../application/project_providers.dart';
import '../../domain/project.dart';
import '../widgets/project_card.dart';
import '../widgets/new_project_sheet.dart';

/// Project Management top-level list — Create/Update/Archive/Favorite/Tags/
/// Search all reachable from here; Offline Editing/Synchronization is
/// transparent (ProjectRepository decides network vs. cache per call).
class ProjectsScreen extends ConsumerStatefulWidget {
  const ProjectsScreen({super.key});

  @override
  ConsumerState<ProjectsScreen> createState() => _ProjectsScreenState();
}

class _ProjectsScreenState extends ConsumerState<ProjectsScreen> {
  ProjectStatus? _statusFilter;
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final projectsAsync = ref.watch(projectListProvider(_statusFilter));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Projects'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () => showModalBottomSheet<void>(
              context: context,
              isScrollControlled: true,
              builder: (_) => const NewProjectSheet(),
            ),
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(56),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: TextField(
              decoration: const InputDecoration(
                hintText: 'Search projects',
                prefixIcon: Icon(Icons.search),
                isDense: true,
              ),
              onChanged: (v) => setState(() => _query = v),
            ),
          ),
        ),
      ),
      body: Column(
        children: [
          SizedBox(
            height: 44,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              children: [
                _FilterChip(label: 'All', selected: _statusFilter == null, onTap: () => setState(() => _statusFilter = null)),
                for (final s in ProjectStatus.values)
                  _FilterChip(
                    label: s.label,
                    selected: _statusFilter == s,
                    onTap: () => setState(() => _statusFilter = s),
                  ),
              ],
            ),
          ),
          Expanded(
            child: projectsAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(child: Text('Could not load projects: $e')),
              data: (projects) {
                final filtered = _query.isEmpty
                    ? projects
                    : projects.where((p) => p.name.toLowerCase().contains(_query.toLowerCase())).toList();
                if (filtered.isEmpty) {
                  return const Center(child: Text('No projects yet'));
                }
                return RefreshIndicator(
                  onRefresh: () async => ref.invalidate(projectListProvider(_statusFilter)),
                  child: ListView.builder(
                    padding: const EdgeInsets.all(12),
                    itemCount: filtered.length,
                    itemBuilder: (context, index) {
                      final project = filtered[index];
                      return ProjectCard(
                        project: project,
                        onTap: () => context.push(AppRoutes.projectDetailPath(project.id)),
                        onToggleFavorite: () => ref
                            .read(projectRepositoryProvider)
                            .toggleFavorite(project.id, !project.isFavorite)
                            .whenComplete(() => ref.invalidate(projectListProvider(_statusFilter))),
                      );
                    },
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: ChoiceChip(label: Text(label), selected: selected, onSelected: (_) => onTap()),
    );
  }
}
