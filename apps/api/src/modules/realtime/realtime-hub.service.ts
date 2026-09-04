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
///
/// Module 18 — task #517 (SSE hardening audit), disclosed known
/// limitation (not fixed this phase): `workspaceStreams` entries are
/// never removed once created, so every distinct workspace that has ever
/// opened a stream keeps one `Subject` alive for the process's lifetime.
/// This is bounded by workspace count (not by connection or reconnect
/// count — per-connection RxJS subscriptions to a given workspace's
/// Subject are torn down correctly on disconnect, see
/// RealtimeController's own subscribe/unsubscribe handling), so it's a
/// slow, small per-workspace leak rather than an unbounded one. A correct
/// fix would need a subscriber-refcount check (RxJS's Subject exposes
/// `observed`) to delete an entry once its last subscriber disconnects,
/// which risks a race against a new subscriber arriving in the same tick
/// — not safely verifiable without running the test suite in this
/// sandbox. Tracked as a concrete follow-up in docs/operations/ (Phase
/// 29).
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
