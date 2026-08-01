import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/core_providers.dart';
import '../data/evidence_repository.dart';

final evidenceRepositoryProvider = Provider<EvidenceRepository>((ref) {
  return EvidenceRepository(
    apiClient: ref.watch(apiClientProvider),
    database: ref.watch(localDatabaseProvider),
    connectivity: ref.watch(connectivityServiceProvider),
  );
});
