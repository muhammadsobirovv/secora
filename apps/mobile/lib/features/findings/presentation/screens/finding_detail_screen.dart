import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../application/finding_providers.dart';
import '../../domain/finding.dart';
import '../widgets/severity_badge.dart';

class FindingDetailScreen extends ConsumerWidget {
  const FindingDetailScreen({super.key, required this.findingId});
  final String findingId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final findingAsync = ref.watch(findingDetailProvider(findingId));
    return Scaffold(
      appBar: AppBar(title: const Text('Finding')),
      body: findingAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Could not load finding: $e')),
        data: (finding) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Row(children: [
              SeverityBadge(severity: finding.severity),
              const SizedBox(width: 8),
              Chip(label: Text(finding.stage.label)),
            ]),
            const SizedBox(height: 12),
            Text(finding.title, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text(finding.description, style: const TextStyle(color: AppColors.textSecondary)),
            if (finding.cwe != null) ...[
              const SizedBox(height: 12),
              Text('CWE: ${finding.cwe}'),
            ],
            if (finding.cvssScore != null) ...[
              const SizedBox(height: 4),
              Text('CVSS: ${finding.cvssScore}'),
            ],
            const SizedBox(height: 24),
            Text('Move to stage', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                FindingStage.triaged,
                FindingStage.verified,
                FindingStage.reported,
                FindingStage.resolved,
                FindingStage.closed,
              ]
                  .map((s) => ActionChip(
                        label: Text(s.label),
                        onPressed: () async {
                          await ref.read(findingRepositoryProvider).transitionStage(findingId, s);
                          ref.invalidate(findingDetailProvider(findingId));
                        },
                      ))
                  .toList(),
            ),
          ],
        ),
      ),
    );
  }
}
