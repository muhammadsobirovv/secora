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
}

export const USERS_REPOSITORY = Symbol('USERS_REPOSITORY');
