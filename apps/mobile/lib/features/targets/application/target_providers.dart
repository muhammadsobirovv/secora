import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/core_providers.dart';
import '../data/target_repository.dart';
import '../domain/target.dart';

final targetRepositoryProvider = Provider<TargetRepository>((ref) {
  return TargetRepository(
    apiClient: ref.watch(apiClientProvider),
    database: ref.watch(localDatabaseProvider),
    connectivity: ref.watch(connectivityServiceProvider),
    syncEngine: ref.watch(syncEngineProvider),
  );
});

final projectTargetsProvider =
    FutureProvider.autoDispose.family<List<Target>, String>((ref, projectId) {
  return ref.watch(targetRepositoryProvider).listTargets(projectId);
});
