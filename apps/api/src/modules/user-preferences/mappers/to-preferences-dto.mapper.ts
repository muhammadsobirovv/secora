import type { UserPreferencesDto } from '@pentesthub/shared';
import type { UserPreferences } from '../../../prisma-types.js';

export function toUserPreferencesDto(
  prefs: UserPreferences,
): UserPreferencesDto {
  return {
    theme: prefs.theme,
    language: prefs.language,
    timezone: prefs.timezone,
    notificationsEnabled: prefs.notificationsEnabled,
    telemetryOptOut: prefs.telemetryOptOut,
    onboardingCompletedAt: prefs.onboardingCompletedAt
      ? prefs.onboardingCompletedAt.toISOString()
      : null,
  };
}
