/// Module 15 — task #348 "i18n architecture — English/Uzbek/Russian".
///
/// This is the single source of truth for which locales the platform
/// supports, shared by the API (locale resolution + backend message
/// catalog), the web app, the desktop app, and (indirectly, via its own
/// ARB files) the mobile app. Adding a fourth locale later means adding one
/// entry here plus the corresponding message-catalog/ARB entries — nothing
/// else in this list needs to change shape.
export const SUPPORTED_LOCALES = ["en", "uz", "ru"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

/// Matches `UserPreferences.language`'s Prisma column default ("en") — see
/// apps/api/prisma/schema.prisma. Also what a request with no resolvable
/// preference or Accept-Language header falls back to.
export const DEFAULT_LOCALE: Locale = "en";

/// Each locale's own name for itself (not translated into the other two),
/// for use in locale-picker UI across web/desktop.
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  uz: "O'zbekcha",
  ru: "Русский",
};

export function isSupportedLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
