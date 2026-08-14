import type { User } from '../../../../prisma-types.js';

export interface CreateUserInput {
  email: string;
  passwordHash: string | null;
  displayName: string;
  emailVerified: boolean;
}

export interface UsersRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  create(input: CreateUserInput): Promise<User>;
  updatePasswordHash(id: string, passwordHash: string): Promise<void>;
  setEmailVerified(id: string): Promise<void>;
  /// Returns the updated row so the caller can check the new count against
  /// the lockout threshold without a second query.
  recordFailedLogin(id: string): Promise<User>;
  resetFailedLogin(id: string): Promise<void>;
  lockUntil(id: string, until: Date): Promise<void>;
  /// Module 15 — Privacy controls (task #342). Sets status: 'DELETED' —
  /// already the terminal state login.use-case.ts/refresh.use-case.ts/
  /// oauth-exchange.use-case.ts check for and reject (see
  /// UserStatus enum in schema.prisma, unused by any write path until now).
  /// Intentionally a soft status flip, not a row deletion or field-by-field
  /// anonymization — full data erasure across the ~40+ tenant tables a user
  /// may have touched is out of scope for this task (see task #342's
  /// completion metadata for the explicit disclosure).
  markDeleted(id: string): Promise<void>;
}

export const USERS_REPOSITORY = Symbol('USERS_REPOSITORY');
