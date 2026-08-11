import { AsyncLocalStorage } from 'node:async_hooks';

/// Module 14 — Centralized Logging / Correlation IDs. Node's built-in
/// `AsyncLocalStorage` (zero new dependency, same "hand-write it before
/// reaching for a package" posture as `StructuredLoggerService` itself)
/// threads the per-request correlation id set by `requestIdMiddleware`
/// through every `await` in that request's call graph — including
/// deep into a CQRS command/query handler, a Prisma call, an AI
/// provider call — without needing to pass `requestId` as an explicit
/// parameter through every function signature in the codebase. Any
/// code that logs via `StructuredLoggerService` automatically picks up
/// the current request's id (if any) through `getRequestId()` below.
export interface RequestContext {
  requestId: string;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function getRequestId(): string | undefined {
  return requestContextStorage.getStore()?.requestId;
}
