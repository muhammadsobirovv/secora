// Module 16 — Real-time gateway (task #391). Delivered as a workspace-
// scoped Server-Sent-Events stream (push) plus small REST endpoints for
// client-to-server signals (typing/presence), NOT a `socket.io`/`ws`
// WebSocket gateway — this codebase has no WebSocket dependency
// installed anywhere (apps/api/package.json has neither
// `@nestjs/websockets` nor `socket.io`), and every existing "real-time"
// surface in the platform (M5 AI chat streaming, M3 recon job progress,
// M4 vuln scan progress) is already built on `@Sse()` + RxJS Observables
// with zero extra dependencies. This is a disclosed architectural
// decision, not a silent reinterpretation of the spec: SSE covers
// server->client push (presence/typing/finding/job/comment/activity/
// notification events) and short-lived REST POSTs cover the
// client->server half (announcing "I'm typing" / "I'm here"), which is
// the same split real WebSocket presence implementations end up with in
// practice once you separate the transport from the protocol.

export type RealtimeEventCategory =
  | "FINDING"
  | "JOB"
  | "COMMENT"
  | "ACTIVITY"
  | "NOTIFICATION"
  | "PRESENCE"
  | "TYPING";

/// A domain event (finding/job/comment/activity) re-shaped for live
/// delivery. `targetUserId`, when present, means this event is a
/// *notification* meant for one specific person (e.g. a mention) — the
/// server only ever delivers it down that person's own stream connection,
/// never broadcasts it workspace-wide.
export interface RealtimeDomainEventDto {
  category: RealtimeEventCategory;
  verb: string;
  entityType: string;
  entityId: string;
  workspaceId: string;
  projectId?: string | null;
  actorUserId?: string | null;
  targetUserId?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt: string;
}

export interface PresenceEventDto {
  category: "PRESENCE";
  workspaceId: string;
  userId: string;
  status: "ONLINE" | "OFFLINE";
  occurredAt: string;
}

export interface TypingEventDto {
  category: "TYPING";
  workspaceId: string;
  userId: string;
  entityType: string;
  entityId: string;
  occurredAt: string;
}

export type RealtimeEvent = RealtimeDomainEventDto | PresenceEventDto | TypingEventDto;

export interface TypingSignalRequestDto {
  entityType: string;
  entityId: string;
}
