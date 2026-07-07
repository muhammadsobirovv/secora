import type { Request } from 'express';

export interface RequestContext {
  ipAddress: string;
  userAgent: string;
}

export function extractRequestContext(req: Request): RequestContext {
  const userAgentHeader = req.headers['user-agent'];
  // The array-narrowed branch types as `any[]` here (an Express 5 /
  // @types/node header-typing quirk) rather than `string[]` — HTTP headers
  // are always strings, so the cast is safe.
  const userAgent = Array.isArray(userAgentHeader)
    ? ((userAgentHeader[0] as string | undefined) ?? '')
    : (userAgentHeader ?? '');
  return { ipAddress: req.ip ?? '', userAgent };
}
