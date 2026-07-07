import type { Request } from 'express';

/// What JwtStrategy.validate() puts on req.user. Kept intentionally small —
/// it's exactly what's embedded in the access token, not a full User row.
export interface RequestUser {
  id: string;
  email: string;
  roles: string[];
  sessionId: string;
}

export interface AuthenticatedRequest extends Request {
  user: RequestUser;
}
