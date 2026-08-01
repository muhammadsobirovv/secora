import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../application/agent_providers.dart';
import '../../domain/agent_run.dart';

/// Live task tree + activity log while an orchestration run is in flight —
/// Explainability's full narrative view (plan reasoning, alternatives,
/// per-task evidence) is reachable via the "Explain" action once the run
/// reaches a terminal status, rendered as a simple text sheet from
/// `AgentRepository.explainRun`'s raw payload rather than a fully typed
/// widget tree (kept intentionally lighter than the web Explainability
/// view for this pass — see docs/mobile/mobile-architecture-guide.md).
class AgentRunDetailScreen extends ConsumerWidget {
  const AgentRunDetailScreen({super.key, required this.runId});
  final String runId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(agentRunStateProvider(runId));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Orchestration run'),
        actions: [
          if (!state.status.isTerminal)
            IconButton(
              icon: const Icon(Icons.cancel_outlined),
              onPressed: () => ref.read(agentRepositoryProvider).cancelRun(runId),
            ),
          IconButton(
            icon: const Icon(Icons.lightbulb_outline),
            tooltip: 'Explain',
            onPressed: () => _showExplanation(context, ref),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: Row(children: [
              Chip(label: Text(state.status.wire)),
              const SizedBox(width: 8),
              Text('${state.tasks.length} tasks', style: const TextStyle(color: AppColors.textSecondary)),
            ]),
          ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              children: [
                ...state.tasks.values.map((task) => _TaskTile(task: task)),
                const Divider(height: 24),
                Text('Activity log', style: Theme.of(context).textTheme.titleSmall),
                const SizedBox(height: 8),
                ...state.log.map((line) => Padding(
                      padding: const EdgeInsets.symmetric(vertical: 2),
                      child: Text(line, style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                    )),
                if (state.error != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(state.error!, style: const TextStyle(color: AppColors.danger)),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _showExplanation(BuildContext context, WidgetRef ref) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => FutureBuilder<Map<String, dynamic>>(
        future: ref.read(agentRepositoryProvider).explainRun(runId),
        builder: (ctx, snapshot) {
          if (!snapshot.hasData) {
            return const SizedBox(height: 200, child: Center(child: CircularProgressIndicator()));
          }
          final data = snapshot.data!;
          return Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Why this result', style: Theme.of(ctx).textTheme.titleLarge),
                const SizedBox(height: 12),
                Text(data['planReasoning'] as String? ?? 'No plan reasoning recorded.'),
                const SizedBox(height: 12),
                Text('Overall confidence: ${data['overallConfidence'] ?? 'n/a'}'),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _TaskTile extends StatelessWidget {
  const _TaskTile({required this.task});
  final AgentTask task;

  Color get _statusColor => switch (task.status) {
        AgentTaskStatus.completed => AppColors.success,
        AgentTaskStatus.failed => AppColors.danger,
        AgentTaskStatus.running || AgentTaskStatus.retrying => AppColors.info,
        _ => AppColors.textSecondary,
      };

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: Icon(Icons.smart_toy_outlined, color: _statusColor),
        title: Text(task.title),
        subtitle: Text(task.reasoningSummary ?? task.agentType),
        trailing: Text(task.status.wire, style: TextStyle(color: _statusColor, fontSize: 11)),
      ),
    );
  }
}
