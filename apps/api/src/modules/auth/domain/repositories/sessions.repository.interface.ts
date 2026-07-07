import type { Session } from '../../../../prisma-types.js';

export interface CreateSessionInput {
  userId: string;
  deviceName: string;
  ipAddress: string;
  userAgent: string;
  browser?: string;
  os?: string;
}

export interface SessionsRepository {
  create(input: CreateSessionInput): Promise<Session>;
  findById(id: string): Promise<Session | null>;
  findActiveByUser(userId: string): Promise<Session[]>;
  touchLastActive(id: string): Promise<void>;
  revoke(id: string): Promise<void>;
  /// exceptSessionId lets "change password" keep the current session alive
  /// while revoking every other one.
  revokeAllForUser(userId: string, exceptSessionId?: string): Promise<void>;
}

export const SESSIONS_REPOSITORY = Symbol('SESSIONS_REPOSITORY');
