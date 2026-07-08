export type Theme = "LIGHT" | "DARK" | "SYSTEM";

export interface UserPreferencesDto {
  theme: Theme;
  language: string;
  timezone: string;
  notificationsEnabled: boolean;
}

export interface UpdateUserPreferencesRequestDto {
  theme?: Theme;
  language?: string;
  timezone?: string;
  notificationsEnabled?: boolean;
}
