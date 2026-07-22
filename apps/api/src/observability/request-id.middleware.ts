import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/// Assigns (or propagates, if the caller/gateway already set one) a
/// per-request correlation id — echoed back as `X-Request-Id` and
/// attached to `req` so StructuredLoggerService and any handler can
/// include it in log lines, letting an operator grep one request's
/// full server-side trace across every log line it produced.
export interface RequestWithId extends Request {
  requestId: string;
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('X-Request-Id');
  const requestId = incoming && incoming.length <= 128 ? incoming : randomUUID();
  (req as RequestWithId).requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}
