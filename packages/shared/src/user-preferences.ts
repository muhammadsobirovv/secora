export type Theme = "LIGHT" | "DARK" | "SYSTEM";

export interface UserPreferencesDto {
  theme: Theme;
  language: string;
  timezone: string;
  notificationsEnabled: boolean;
  /// Module 15 — Privacy controls (task #342). Per-user telemetry opt-out,
  /// consulted alongside the operator-level TELEMETRY_ENABLED env flag —
  /// see the matching schema.prisma field comment.
  telemetryOptOut: boolean;
  /// Module 15 — task #351 (first-run onboarding). Null until the user
  /// finishes (or explicitly dismisses) the onboarding flow; an ISO 8601
  /// timestamp string afterward. `apps/web`'s dashboard uses "is this
  /// null?" as the sole signal to show the onboarding overlay — see
  /// `features/onboarding/onboarding-flow.tsx`.
  onboardingCompletedAt: string | null;
}

export interface UpdateUserPreferencesRequestDto {
  theme?: Theme;
  language?: string;
  timezone?: string;
  notificationsEnabled?: boolean;
  telemetryOptOut?: boolean;
  /// Write-only, one-directional on the wire: sending `true` stamps
  /// `onboardingCompletedAt` with the current server time. Sending `false`
  /// or omitting the field is a no-op — there's no supported "un-complete
  /// onboarding" action yet, so the DTO doesn't pretend to offer one.
  onboardingCompleted?: boolean;
}
