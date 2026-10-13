import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@pentesthub/shared";

/// Pure locale helpers shared by server and client code (no React, no
/// next/headers), so the same resolution rules run in app/layout.tsx on
/// the server and in the client provider.
///
/// The user's choice lives in three places, strongest first:
///   1. cookie `phai.locale`  — the only one the server can read, so SSR
///      renders the right language on first paint;
///   2. localStorage `phai.language` — mirror (kept for the desktop app's
///      key and for visitors who picked a language before cookies existed);
///   3. `UserPreferences.language` on the server — follows a signed-in user
///      across browsers/devices.
/// Resolution order for a request: cookie -> Accept-Language -> "en"
/// (the signed-in preference is applied on the client at login by
/// LocaleSync, which writes the cookie).

export const LOCALE_COOKIE = "phai.locale";
export const LOCALE_STORAGE_KEY = "phai.language";
/// sessionStorage flag: the visitor changed language while signed out in
/// this browser session, so that explicit choice should win over the
/// stored server preference at the next login.
export const PRE_LOGIN_CHOICE_KEY = "phai.locale.preLogin";
export const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/// Picks the best supported language from an Accept-Language header
/// ("uz-Latn-UZ,uz;q=0.9,en;q=0.8" -> "uz"). Returns null when none of the
/// listed languages is supported.
export function parseAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const ranked = header
    .split(",")
    .map((part) => {
      const [tag = "", ...params] = part.trim().split(";");
      const qParam = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const q = qParam ? Number(qParam.slice(2)) : 1;
      return { tag: tag.trim().toLowerCase(), q };
    })
    .filter((entry) => entry.tag && entry.tag !== "*" && !Number.isNaN(entry.q) && entry.q > 0)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    const primary = tag.split("-")[0] ?? "";
    if (isSupportedLocale(primary)) return primary;
  }
  return null;
}

export function resolveLocale(input: {
  cookie?: string | null;
  acceptLanguage?: string | null;
}): Locale {
  if (input.cookie && isSupportedLocale(input.cookie)) return input.cookie;
  return parseAcceptLanguage(input.acceptLanguage) ?? DEFAULT_LOCALE;
}

/// Intl locale tag for a supported locale (Uzbek is written in Latin).
export const INTL_LOCALE: Record<Locale, string> = {
  en: "en",
  uz: "uz-Latn",
  ru: "ru",
};
