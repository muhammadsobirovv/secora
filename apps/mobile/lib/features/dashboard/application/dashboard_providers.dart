import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/core_providers.dart';
import '../data/dashboard_repository.dart';

final dashboardRepositoryProvider = Provider<DashboardRepository>((ref) {
  return DashboardRepository(apiClient: ref.watch(apiClientProvider));
});

final dashboardSummaryProvider = FutureProvider.autoDispose<DashboardSummary>((ref) async {
  try {
    return await ref.watch(dashboardRepositoryProvider).getSummary();
  } catch (_) {
    return DashboardSummary.empty(); // offline / summary endpoint unreachable — degrade gracefully.
  }
});

final recentActivityProvider = FutureProvider.autoDispose<List<ActivityEvent>>((ref) async {
  try {
    return await ref.watch(dashboardRepositoryProvider).getRecentActivity();
  } catch (_) {
    return const [];
  }
});
