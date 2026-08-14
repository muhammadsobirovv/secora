import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from '@pentesthub/shared';

/// Module 15 — task #348 "i18n architecture — English/Uzbek/Russian".
///
/// Resolution order (first match wins):
///  1. `preferredLanguage` — the caller's stored `UserPreferences.language`
///     value, when it's one of `SUPPORTED_LOCALES`. This is deliberately
///     checked first: an explicit user choice always outranks whatever
///     their current browser/client happens to send.
///  2. `acceptLanguageHeader` — the first language tag in the request's
///     `Accept-Language` header (RFC 7231 §5.3.5) that matches a supported
///     locale, ignoring quality values (`;q=...`) and region subtags (e.g.
///     `en-US` -> `en`) — good enough for a 3-locale platform without
///     pulling in a full BCP 47 negotiation library.
///  3. `DEFAULT_LOCALE` ("en") — always resolves to *something*, callers
///     never need to null-check the result.
export function resolveLocale(
  preferredLanguage?: string | null,
  acceptLanguageHeader?: string | null,
): Locale {
  if (preferredLanguage && isSupportedLocale(preferredLanguage)) {
    return preferredLanguage;
  }

  if (acceptLanguageHeader) {
    const tags = acceptLanguageHeader
      .split(',')
      .map((entry) => entry.split(';')[0]?.trim().split('-')[0]?.toLowerCase())
      .filter((tag): tag is string => Boolean(tag));

    const match = tags.find((tag) => isSupportedLocale(tag));
    if (match) return match;
  }

  return DEFAULT_LOCALE;
}
