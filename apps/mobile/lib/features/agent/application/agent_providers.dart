import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/core_providers.dart';
import '../../ai_chat/application/ai_chat_providers.dart';
import '../data/agent_repository.dart';
import '../domain/agent_run.dart';

final agentRepositoryProvider = Provider<AgentRepository>((ref) {
  return AgentRepository(apiClient: ref.watch(apiClientProvider), sseClient: ref.watch(sseClientProvider));
});

final orchestrationRunListProvider = FutureProvider.autoDispose<List<OrchestrationRunSummary>>((ref) {
  return ref.watch(agentRepositoryProvider).listRuns();
});

/// Live per-run state — subscribes to the SSE stream while the run is
/// non-terminal, same "poll/stream while non-terminal, then stop" pattern
/// apps/web's `useOrchestrationRun`/`useAgentRunStream` hooks use.
final agentRunStateProvider =
    NotifierProvider.autoDispose.family<AgentRunNotifier, AgentRunState, String>(AgentRunNotifier.new);

class AgentRunState {
  const AgentRunState({
    this.status = OrchestrationRunStatus.pending,
    this.tasks = const {},
    this.log = const [],
    this.error,
  });

  final OrchestrationRunStatus status;
  final Map<String, AgentTask> tasks;
  final List<String> log;
  final String? error;

  AgentRunState copyWith({
    OrchestrationRunStatus? status,
    Map<String, AgentTask>? tasks,
    List<String>? log,
    String? error,
  }) =>
      AgentRunState(
        status: status ?? this.status,
        tasks: tasks ?? this.tasks,
        log: log ?? this.log,
        error: error ?? this.error,
      );
}

class AgentRunNotifier extends FamilyNotifier<AgentRunState, String> {
  @override
  AgentRunState build(String runId) {
    Future.microtask(_subscribe);
    ref.onDispose(() {}); // stream subscription is tied to the SSE connect() call's own lifecycle.
    return const AgentRunState();
  }

  Future<void> _subscribe() async {
    try {
      await for (final event in ref.read(agentRepositoryProvider).streamRun(arg)) {
        switch (event) {
          case TaskStarted(:final task):
            state = state.copyWith(
              tasks: {...state.tasks, task.id: task},
              log: [...state.log, 'Started: ${task.title}'],
            );
          case TaskProgress(:final taskId, :final reasoningSummary):
            final existing = state.tasks[taskId];
            if (existing != null) {
              state = state.copyWith(tasks: {
                ...state.tasks,
                taskId: existing.copyWith(reasoningSummary: reasoningSummary),
              });
            }
          case TaskCompleted(:final task):
            state = state.copyWith(
              tasks: {...state.tasks, task.id: task},
              log: [...state.log, 'Completed: ${task.title}'],
            );
          case TaskFailed(:final task):
            state = state.copyWith(
              tasks: {...state.tasks, task.id: task},
              log: [...state.log, 'Failed: ${task.title}'],
            );
          case RunCompleted(:final status):
            state = state.copyWith(status: status, log: [...state.log, 'Run finished: ${status.wire}']);
          case RunFailed(:final message):
            state = state.copyWith(
              status: OrchestrationRunStatus.failed,
              error: message,
              log: [...state.log, 'Run failed: $message'],
            );
          case RunCancelled():
            state = state.copyWith(status: OrchestrationRunStatus.cancelled);
          case RunEventUnknown():
            break;
        }
      }
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }
}
