import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/app_routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../ai_chat/application/ai_chat_providers.dart';
import '../../application/agent_providers.dart';
import '../../domain/agent_run.dart';

/// Agent Copilot landing — start a new autonomous multi-agent run (goal
/// decomposed across the twelve specialist agents, Module 11), browse
/// recent runs, or jump into a plain streaming AI chat conversation.
class AgentScreen extends ConsumerStatefulWidget {
  const AgentScreen({super.key});

  @override
  ConsumerState<AgentScreen> createState() => _AgentScreenState();
}

class _AgentScreenState extends ConsumerState<AgentScreen> {
  final _goalController = TextEditingController();
  bool _submitting = false;

  Future<void> _startRun() async {
    if (_goalController.text.trim().isEmpty) return;
    setState(() => _submitting = true);
    try {
      final id = await ref.read(agentRepositoryProvider).createRun(_goalController.text.trim());
      _goalController.clear();
      ref.invalidate(orchestrationRunListProvider);
      if (mounted) context.push(AppRoutes.agentRunDetailPath(id));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _openChat() async {
    final conversations = await ref.read(aiChatRepositoryProvider).listConversations();
    if (conversations.isNotEmpty) {
      if (mounted) context.push(AppRoutes.agentChatPath(conversations.first.id));
      return;
    }
    // No conversations yet — a fresh conversation needs a projectId; the
    // simplest mobile entry point starts one scoped to "no project" (global
    // workspace chat), matching apps/web's default landing conversation.
    final created = await ref.read(aiChatRepositoryProvider).createConversation('');
    if (mounted) context.push(AppRoutes.agentChatPath(created.id));
  }

  @override
  Widget build(BuildContext context) {
    final runsAsync = ref.watch(orchestrationRunListProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('AI Copilot'),
        actions: [
          IconButton(icon: const Icon(Icons.chat_bubble_outline), onPressed: _openChat),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(orchestrationRunListProvider),
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text('Give the AI a goal', style: TextStyle(fontWeight: FontWeight.w600)),
                    const SizedBox(height: 4),
                    const Text(
                      'The Master Orchestrator plans and delegates it across the specialist agents.',
                      style: TextStyle(color: AppColors.textSecondary, fontSize: 12),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _goalController,
                      minLines: 2,
                      maxLines: 4,
                      decoration: const InputDecoration(hintText: 'e.g. Assess example.com for OWASP Top 10 issues'),
                    ),
                    const SizedBox(height: 12),
                    ElevatedButton(
                      onPressed: _submitting ? null : _startRun,
                      child: _submitting
                          ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                          : const Text('Start run'),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 20),
            Text('Recent runs', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            runsAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Text('Could not load runs: $e'),
              data: (runs) => runs.isEmpty
                  ? const Text('No runs yet')
                  : Column(
                      children: runs
                          .map((r) => Card(
                                child: ListTile(
                                  title: Text(r.goal, maxLines: 2, overflow: TextOverflow.ellipsis),
                                  subtitle: Text('${r.completedTaskCount}/${r.taskCount} tasks · ${r.status.wire}'),
                                  trailing: _StatusDot(status: r.status),
                                  onTap: () => context.push(AppRoutes.agentRunDetailPath(r.id)),
                                ),
                              ))
                          .toList(),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatusDot extends StatelessWidget {
  const _StatusDot({required this.status});
  final OrchestrationRunStatus status;

  Color get _color => switch (status) {
        OrchestrationRunStatus.completed => AppColors.success,
        OrchestrationRunStatus.failed => AppColors.danger,
        OrchestrationRunStatus.cancelled => AppColors.textSecondary,
        OrchestrationRunStatus.running || OrchestrationRunStatus.planning => AppColors.info,
        _ => AppColors.warning,
      };

  @override
  Widget build(BuildContext context) {
    return Container(width: 10, height: 10, decoration: BoxDecoration(color: _color, shape: BoxShape.circle));
  }
}
