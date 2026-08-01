import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/providers/core_providers.dart';
import '../../../../core/router/app_routes.dart';
import '../../data/global_search_repository.dart';

final globalSearchRepositoryProvider = Provider<GlobalSearchRepository>((ref) {
  return GlobalSearchRepository(
    apiClient: ref.watch(apiClientProvider),
    database: ref.watch(localDatabaseProvider),
    connectivity: ref.watch(connectivityServiceProvider),
  );
});

class GlobalSearchScreen extends ConsumerStatefulWidget {
  const GlobalSearchScreen({super.key});

  @override
  ConsumerState<GlobalSearchScreen> createState() => _GlobalSearchScreenState();
}

class _GlobalSearchScreenState extends ConsumerState<GlobalSearchScreen> {
  List<SearchResult> _results = [];
  bool _loading = false;

  Future<void> _search(String query) async {
    setState(() => _loading = true);
    final results = await ref.read(globalSearchRepositoryProvider).search(query);
    setState(() {
      _results = results;
      _loading = false;
    });
  }

  IconData _iconFor(String type) => switch (type) {
        'PROJECT' => Icons.folder,
        'TARGET' => Icons.adjust,
        'FINDING' => Icons.bug_report,
        'EVIDENCE' => Icons.image,
        'NOTE' => Icons.sticky_note_2,
        _ => Icons.description,
      };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: TextField(
          autofocus: true,
          decoration: const InputDecoration(hintText: 'Search everything...', border: InputBorder.none),
          onChanged: _search,
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView.builder(
              itemCount: _results.length,
              itemBuilder: (context, index) {
                final r = _results[index];
                return ListTile(
                  leading: Icon(_iconFor(r.type)),
                  title: Text(r.title),
                  subtitle: r.snippet != null ? Text(r.snippet!, maxLines: 1, overflow: TextOverflow.ellipsis) : null,
                  trailing: Chip(label: Text(r.type), visualDensity: VisualDensity.compact),
                  onTap: () {
                    switch (r.type) {
                      case 'PROJECT':
                        context.push(AppRoutes.projectDetailPath(r.id));
                      case 'FINDING':
                        context.push(AppRoutes.findingDetailPath(r.id));
                      default:
                        if (r.projectId != null) context.push(AppRoutes.projectDetailPath(r.projectId!));
                    }
                  },
                );
              },
            ),
    );
  }
}
