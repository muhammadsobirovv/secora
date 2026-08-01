import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/app_routes.dart';
import '../../application/finding_providers.dart';
import '../../domain/finding.dart';
import '../widgets/severity_badge.dart';

class FindingsScreen extends ConsumerStatefulWidget {
  const FindingsScreen({super.key});

  @override
  ConsumerState<FindingsScreen> createState() => _FindingsScreenState();
}

class _FindingsScreenState extends ConsumerState<FindingsScreen> {
  FindingSeverity? _severity;

  @override
  Widget build(BuildContext context) {
    final findingsAsync = ref.watch(findingListProvider(_severity));
    return Scaffold(
      appBar: AppBar(title: const Text('Findings')),
      body: Column(
        children: [
          SizedBox(
            height: 44,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              children: [
                ChoiceChip(
                  label: const Text('All'),
                  selected: _severity == null,
                  onSelected: (_) => setState(() => _severity = null),
                ),
                for (final s in FindingSeverity.values)
                  Padding(
                    padding: const EdgeInsets.only(left: 6),
                    child: ChoiceChip(
                      label: Text(s.wire),
                      selected: _severity == s,
                      onSelected: (_) => setState(() => _severity = s),
                    ),
                  ),
              ],
            ),
          ),
          Expanded(
            child: findingsAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(child: Text('Could not load findings: $e')),
              data: (findings) => findings.isEmpty
                  ? const Center(child: Text('No findings'))
                  : RefreshIndicator(
                      onRefresh: () async => ref.invalidate(findingListProvider(_severity)),
                      child: ListView.separated(
                        itemCount: findings.length,
                        separatorBuilder: (_, __) => const Divider(height: 1),
                        itemBuilder: (context, index) {
                          final f = findings[index];
                          return ListTile(
                            title: Text(f.title, maxLines: 1, overflow: TextOverflow.ellipsis),
                            subtitle: Text(f.stage.label),
                            trailing: SeverityBadge(severity: f.severity),
                            onTap: () => context.push(AppRoutes.findingDetailPath(f.id)),
                          );
                        },
                      ),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}
