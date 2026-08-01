import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/core_providers.dart';
import '../data/project_repository.dart';
import '../domain/project.dart';

final projectRepositoryProvider = Provider<ProjectRepository>((ref) {
  return ProjectRepository(
    apiClient: ref.watch(apiClientProvider),
    database: ref.watch(localDatabaseProvider),
    connectivity: ref.watch(connectivityServiceProvider),
    syncEngine: ref.watch(syncEngineProvider),
  );
});

final projectListProvider =
    FutureProvider.autoDispose.family<List<Project>, ProjectStatus?>((ref, status) {
  return ref.watch(projectRepositoryProvider).listProjects(status: status);
});

final favoriteProjectsProvider = FutureProvider.autoDispose<List<Project>>((ref) {
  return ref.watch(projectRepositoryProvider).listProjects(favoritesOnly: true);
});

final projectDetailProvider = FutureProvider.autoDispose.family<Project, String>((ref, id) {
  return ref.watch(projectRepositoryProvider).getProject(id);
});
