import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/core_providers.dart';
import '../data/report_repository.dart';
import '../domain/bug_report.dart';

final reportRepositoryProvider = Provider<ReportRepository>((ref) {
  return ReportRepository(apiClient: ref.watch(apiClientProvider));
});

final reportListProvider = FutureProvider.autoDispose<List<BugReport>>((ref) {
  return ref.watch(reportRepositoryProvider).listReports();
});

final reportDetailProvider = FutureProvider.autoDispose.family<BugReport, String>((ref, id) {
  return ref.watch(reportRepositoryProvider).getReport(id);
});
