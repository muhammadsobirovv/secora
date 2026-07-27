import { Injectable } from '@nestjs/common';
import { ReplaySubject } from 'rxjs';
import type { OrchestrationStreamEvent } from '@pentesthub/shared';

interface ActiveOrchestrationStream {
  subject: ReplaySubject<OrchestrationStreamEvent>;
  controller: AbortController;
}

const CLEANUP_DELAY_MS = 5 * 60 * 1000;

/// Same in-process pub/sub shape as AiChatStreamHubService (see that
/// file's doc comment for the single-process-only caveat, which applies
/// here identically), keyed by orchestrationRunId instead of messageId —
/// bridges AgentOrchestratorService (producer) and the run's SSE
/// controller endpoint (consumer).
@Injectable()
export class AgentOrchestrationStreamHubService {
  private readonly streams = new Map<string, ActiveOrchestrationStream>();

  start(orchestrationRunId: string): ActiveOrchestrationStream {
    const stream: ActiveOrchestrationStream = {
      subject: new ReplaySubject<OrchestrationStreamEvent>(),
      controller: new AbortController(),
    };
    this.streams.set(orchestrationRunId, stream);
    return stream;
  }

  get(orchestrationRunId: string): ActiveOrchestrationStream | undefined {
    return this.streams.get(orchestrationRunId);
  }

  emit(orchestrationRunId: string, event: OrchestrationStreamEvent): void {
    this.streams.get(orchestrationRunId)?.subject.next(event);
  }

  complete(orchestrationRunId: string): void {
    const stream = this.streams.get(orchestrationRunId);
    if (!stream) return;
    stream.subject.complete();
    setTimeout(() => this.streams.delete(orchestrationRunId), CLEANUP_DELAY_MS);
  }

  cancel(orchestrationRunId: string): boolean {
    const stream = this.streams.get(orchestrationRunId);
    if (!stream) return false;
    stream.controller.abort();
    return true;
  }
}
