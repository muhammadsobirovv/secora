import { Injectable } from '@nestjs/common';
import { ReplaySubject } from 'rxjs';
import type { AiChatStreamEvent } from './ai-chat-stream-event.js';

interface ActiveStream {
  subject: ReplaySubject<AiChatStreamEvent>;
  controller: AbortController;
}

const CLEANUP_DELAY_MS = 5 * 60 * 1000;

/// In-process pub/sub keyed by assistant messageId, bridging AiChatService
/// (the producer, running the provider stream + tool loop) and the SSE
/// controller endpoint (the consumer). A ReplaySubject means a client that
/// opens the SSE connection slightly after generation started (or
/// reconnects mid-stream) still sees every event from the start, not just
/// what's left.
///
/// Single-process only by design (documented Phase-1 limitation in ADR
/// 0005) — this module has no Redis/pub-sub layer yet, same as every
/// other in-memory piece of this codebase (e.g. the recon/vuln worker
/// assumes one process too). Multi-instance deployment would need this
/// hub backed by a shared broker instead.
@Injectable()
export class AiChatStreamHubService {
  private readonly streams = new Map<string, ActiveStream>();

  start(messageId: string): ActiveStream {
    const stream: ActiveStream = {
      subject: new ReplaySubject<AiChatStreamEvent>(),
      controller: new AbortController(),
    };
    this.streams.set(messageId, stream);
    return stream;
  }

  get(messageId: string): ActiveStream | undefined {
    return this.streams.get(messageId);
  }

  emit(messageId: string, event: AiChatStreamEvent): void {
    this.streams.get(messageId)?.subject.next(event);
  }

  complete(messageId: string): void {
    const stream = this.streams.get(messageId);
    if (!stream) return;
    stream.subject.complete();
    setTimeout(() => this.streams.delete(messageId), CLEANUP_DELAY_MS);
  }

  cancel(messageId: string): boolean {
    const stream = this.streams.get(messageId);
    if (!stream) return false;
    stream.controller.abort();
    return true;
  }
}
