import type { Theme, UserPreferences } from '../../../../prisma-types.js';

export interface UpdateUserPreferencesInput {
  theme?: Theme;
  language?: string;
  timezone?: string;
  notificationsEnabled?: boolean;
  telemetryOptOut?: boolean;
  /// Module 15 — task #351. Domain-level input is already the translated
  /// `Date`, not the wire-level `onboardingCompleted: boolean` — see
  /// `UpdatePreferencesHandler` for the boolean→Date translation.
  onboardingCompletedAt?: Date;
}

/// Register creates a default row (decision 8, docs/adr/0001-auth-module.md);
/// the update path was added in Module 2 (decision 7,
/// docs/adr/0002-workspace-foundation-module.md) so Settings → Preferences
/// isn't a dead page over an otherwise write-only table.
export interface UserPreferencesRepository {
  createDefault(userId: string): Promise<UserPreferences>;
  findByUserId(userId: string): Promise<UserPreferences | null>;
  update(
    userId: string,
    data: UpdateUserPreferencesInput,
  ): Promise<UserPreferences>;
}

export const USER_PREFERENCES_REPOSITORY = Symbol(
  'USER_PREFERENCES_REPOSITORY',
);
