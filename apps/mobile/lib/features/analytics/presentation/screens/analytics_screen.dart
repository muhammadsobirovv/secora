import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../findings/application/finding_providers.dart';
import '../../../findings/domain/finding.dart';
import '../../../projects/application/project_providers.dart';
import '../../../projects/domain/project.dart';

/// Analytics — Severity Distribution + Projects-by-status computed
/// client-side from the same `findingListProvider`/`projectListProvider`
/// every other screen already reads (no dedicated `/analytics` backend
/// endpoint exists for these two breakdowns). Risk Score / Recon Progress /
/// Scanner Progress / Activity Timeline charts are deferred — those need
/// repositories (a risk-scoring service, recon/scanner job status) not
/// built in this mobile pass; see docs/mobile/mobile-architecture-guide.md.
class AnalyticsScreen extends ConsumerWidget {
  const AnalyticsScreen({super.key});

  Color _severityColor(FindingSeverity s) => switch (s) {
        FindingSeverity.critical => AppColors.severityCritical,
        FindingSeverity.high => AppColors.severityHigh,
        FindingSeverity.medium => AppColors.severityMedium,
        FindingSeverity.low => AppColors.severityLow,
        FindingSeverity.info => AppColors.severityInfo,
      };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final findingsAsync = ref.watch(findingListProvider(null));
    final projectsAsync = ref.watch(projectListProvider(null));

    return Scaffold(
      appBar: AppBar(title: const Text('Analytics')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('Severity distribution', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 12),
          SizedBox(
            height: 200,
            child: findingsAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Text('$e'),
              data: (findings) {
                final counts = <FindingSeverity, int>{};
                for (final f in findings) {
                  counts[f.severity] = (counts[f.severity] ?? 0) + 1;
                }
                if (counts.isEmpty) return const Center(child: Text('No findings yet'));
                return PieChart(
                  PieChartData(
                    sections: counts.entries
                        .map((e) => PieChartSectionData(
                              value: e.value.toDouble(),
                              title: '${e.value}',
                              color: _severityColor(e.key),
                              radius: 70,
                            ))
                        .toList(),
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 24),
          Text('Projects by status', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 12),
          SizedBox(
            height: 200,
            child: projectsAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Text('$e'),
              data: (projects) {
                final counts = <ProjectStatus, int>{};
                for (final p in projects) {
                  counts[p.status] = (counts[p.status] ?? 0) + 1;
                }
                if (counts.isEmpty) return const Center(child: Text('No projects yet'));
                return BarChart(
                  BarChartData(
                    barGroups: counts.entries
                        .toList()
                        .asMap()
                        .entries
                        .map((entry) => BarChartGroupData(x: entry.key, barRods: [
                              BarChartRodData(toY: entry.value.value.toDouble(), color: AppColors.primary),
                            ]))
                        .toList(),
                    titlesData: FlTitlesData(
                      bottomTitles: AxisTitles(
                        sideTitles: SideTitles(
                          showTitles: true,
                          getTitlesWidget: (value, meta) {
                            final entries = counts.entries.toList();
                            final i = value.toInt();
                            if (i < 0 || i >= entries.length) return const SizedBox.shrink();
                            return Padding(
                              padding: const EdgeInsets.only(top: 4),
                              child: Text(entries[i].key.label, style: const TextStyle(fontSize: 10)),
                            );
                          },
                        ),
                      ),
                    ),
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
