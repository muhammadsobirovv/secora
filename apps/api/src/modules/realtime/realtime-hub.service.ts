import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';
import type { RealtimeEvent } from '@pentesthub/shared';

/// Module 16 — Real-time gateway (task #391). In-process pub/sub keyed by
/// workspaceId, the same shape as `AiChatStreamHubService` (Module 5) —
/// a plain `Subject` here rather than a `ReplaySubject`, because presence/
/// typing/live events are inherently "now," not something a newly
/// connected client should replay from the start of the stream's
/// history.
///
/// Single-process only by design, same documented Phase-1 limitation as
/// every other in-memory hub in this codebase (AiChatStreamHubService,
/// the recon/vuln worker's assumption of one process). A multi-instance
/// deployment would need this backed by a shared broker (Redis pub/sub —
/// the same `CacheModule`/`QueueProvider` abstraction layer Module 14
/// already introduced for exactly this class of problem) instead of an
/// in-memory Map.
@Injectable()
export class RealtimeHubService {
  private readonly workspaceStreams = new Map<string, Subject<RealtimeEvent>>();

  private streamFor(workspaceId: string): Subject<RealtimeEvent> {
    let subject = this.workspaceStreams.get(workspaceId);
    if (!subject) {
      subject = new Subject<RealtimeEvent>();
      this.workspaceStreams.set(workspaceId, subject);
    }
    return subject;
  }

  subscribe(workspaceId: string): Subject<RealtimeEvent> {
    return this.streamFor(workspaceId);
  }

  publish(workspaceId: string, event: RealtimeEvent): void {
    this.streamFor(workspaceId).next(event);
  }
}
