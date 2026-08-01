import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/core_providers.dart';
import '../data/finding_repository.dart';
import '../domain/finding.dart';

final findingRepositoryProvider = Provider<FindingRepository>((ref) {
  return FindingRepository(
    apiClient: ref.watch(apiClientProvider),
    database: ref.watch(localDatabaseProvider),
    connectivity: ref.watch(connectivityServiceProvider),
    syncEngine: ref.watch(syncEngineProvider),
  );
});

final findingListProvider =
    FutureProvider.autoDispose.family<List<Finding>, FindingSeverity?>((ref, severity) {
  return ref.watch(findingRepositoryProvider).listFindings(severity: severity);
});

final findingDetailProvider = FutureProvider.autoDispose.family<Finding, String>((ref, id) {
  return ref.watch(findingRepositoryProvider).getFinding(id);
});
