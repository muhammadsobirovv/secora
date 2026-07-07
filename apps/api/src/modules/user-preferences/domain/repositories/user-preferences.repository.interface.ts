import type { UserPreferences } from '../../../../prisma-types.js';

/// Foundation only — no settings-update endpoint this sprint. Register
/// creates a default row (see decision 8, docs/adr/0001-auth-module.md).
export interface UserPreferencesRepository {
  createDefault(userId: string): Promise<UserPreferences>;
  findByUserId(userId: string): Promise<UserPreferences | null>;
}

export const USER_PREFERENCES_REPOSITORY = Symbol(
  'USER_PREFERENCES_REPOSITORY',
);
