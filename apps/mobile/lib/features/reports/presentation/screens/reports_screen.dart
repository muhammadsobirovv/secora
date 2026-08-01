import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/app_routes.dart';
import '../../application/report_providers.dart';

class ReportsScreen extends ConsumerWidget {
  const ReportsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reportsAsync = ref.watch(reportListProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Reports')),
      body: reportsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Could not load reports: $e')),
        data: (reports) => reports.isEmpty
            ? const Center(child: Text('No reports yet'))
            : RefreshIndicator(
                onRefresh: () async => ref.invalidate(reportListProvider),
                child: ListView.separated(
                  itemCount: reports.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (context, index) {
                    final r = reports[index];
                    return ListTile(
                      leading: Icon(r.aiGenerated ? Icons.auto_awesome : Icons.description_outlined),
                      title: Text(r.title),
                      subtitle: Text(r.status.wire),
                      onTap: () => context.push(AppRoutes.reportDetailPath(r.id)),
                    );
                  },
                ),
              ),
      ),
    );
  }
}
