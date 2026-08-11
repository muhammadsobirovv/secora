import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { requestContextStorage } from './request-context.js';

/// Assigns (or propagates, if the caller/gateway already set one) a
/// per-request correlation id — echoed back as `X-Request-Id` and
/// attached to `req` for any handler that wants it directly. Module 14
/// closes the gap this file's doc comment used to only promise: wrapping
/// the rest of the request in `requestContextStorage.run(...)` is what
/// actually makes `StructuredLoggerService` include this id in every log
/// line the request produces (via `getRequestId()`), not just handlers
/// that explicitly read `req.requestId`.
export interface RequestWithId extends Request {
  requestId: string;
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('X-Request-Id');
  const requestId = incoming && incoming.length <= 128 ? incoming : randomUUID();
  (req as RequestWithId).requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  requestContextStorage.run({ requestId }, () => next());
}
