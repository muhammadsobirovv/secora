"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { isSupportedLocale, type Locale } from "@pentesthub/shared";
import { useAuthStore } from "@/lib/stores/auth-store";
import { updatePreferences } from "@/lib/api/user-preferences";
import { setFormatLocale } from "@/lib/format";
import {
  interpolate,
  translate,
  translatePlural,
  type PluralBase,
  type PluralFn,
  type TranslateFn,
  type TranslateParams,
} from "./catalog";
import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE_SECONDS,
  LOCALE_STORAGE_KEY,
  PRE_LOGIN_CHOICE_KEY,
} from "./locale";

export type { MessageKey } from "./catalog";

/// UI language state for the whole app.
///
/// One choice, applied everywhere: the root server layout resolves the
/// language from the `phai.locale` cookie (then Accept-Language, then "en")
/// and passes it in as `initialLocale`, so the very first server render and
/// the first client render already agree — there is no English flash.
/// `setLocale` (an explicit user choice) writes the cookie, mirrors it to
/// localStorage, tells the server preference when signed in, and refreshes
/// the router so server components re-render in the new language.
/// `adoptLocale` does the same minus the server write — used when the
/// signed-in server preference is being applied to this browser.
///
/// Persistence sources and their order are documented in ./locale.ts.

interface I18nContextValue {
  locale: Locale;
  /// An explicit user choice: persists to cookie, localStorage and (when
  /// signed in) the server preference, then re-renders server components.
  setLocale: (locale: Locale) => void;
  /// Applies a locale that came from the server preference; does not write
  /// it back.
  adoptLocale: (locale: Locale) => void;
  t: TranslateFn;
  /// Count-based string from a plural group (see ./plural.ts), in the active locale.
  plural: PluralFn;
}

const I18nContext = React.createContext<I18nContextValue | null>(null);

function readCookie(name: string): string | null {
  const prefix = `${encodeURIComponent(name)}=`;
  for (const part of document.cookie.split("; ")) {
    if (part.startsWith(prefix)) return decodeURIComponent(part.slice(prefix.length));
  }
  return null;
}

export function readLocaleCookie(): Locale | null {
  if (typeof document === "undefined") return null;
  const value = readCookie(LOCALE_COOKIE);
  return value && isSupportedLocale(value) ? value : null;
}

function writeLocaleCookie(locale: Locale): void {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    `${encodeURIComponent(LOCALE_COOKIE)}=${locale}; Path=/; ` +
    `Max-Age=${LOCALE_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

export function I18nProvider({
  children,
  initialLocale,
}: {
  children: React.ReactNode;
  initialLocale: Locale;
}) {
  const router = useRouter();
  const [locale, setLocaleState] = React.useState<Locale>(initialLocale);

  // Synchronously, during render: formatters (lib/format.ts) read this, and
  // they run in descendants' render — an effect would be too late.
  setFormatLocale(locale);

  // Screen readers and browser translate/spell-check use <html lang>; the
  // server already set it from the cookie, this keeps it right after a
  // client-side switch.
  React.useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const apply = React.useCallback(
    (next: Locale, source: "user" | "server") => {
      writeLocaleCookie(next);
      try {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
      } catch {
        // storage disabled — the cookie is the source of truth anyway
      }
      setLocaleState(next);

      if (source === "user") {
        if (useAuthStore.getState().accessToken) {
          void updatePreferences({ language: next }).catch(() => undefined);
        } else {
          try {
            window.sessionStorage.setItem(PRE_LOGIN_CHOICE_KEY, "1");
          } catch {
            // ignore
          }
        }
      }
      router.refresh();
    },
    [router],
  );

  const setLocale = React.useCallback((next: Locale) => apply(next, "user"), [apply]);
  const adoptLocale = React.useCallback((next: Locale) => apply(next, "server"), [apply]);

  // One-time migration: visitors who picked a language before the cookie
  // existed only have localStorage. Promote it so the server can see it.
  React.useEffect(() => {
    if (readLocaleCookie()) return;
    try {
      const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
      if (stored && isSupportedLocale(stored) && stored !== initialLocale) {
        apply(stored, "server");
      }
    } catch {
      // ignore
    }
    // Runs once on mount by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const t = React.useCallback<TranslateFn>(
    (key, params) => translate(locale, key, params),
    [locale],
  );

  const plural = React.useCallback<PluralFn>(
    (base: PluralBase, count, params) => translatePlural(locale, base, count, params),
    [locale],
  );

  const value = React.useMemo<I18nContextValue>(
    () => ({ locale, setLocale, adoptLocale, t, plural }),
    [locale, setLocale, adoptLocale, t, plural],
  );

  // Remounting the subtree on a language change makes every component —
  // including ones that format dates via lib/format.ts without reading this
  // context — re-render in the new language. The QueryClient lives above
  // this provider, so cached data survives.
  return (
    <I18nContext.Provider value={value}>
      <React.Fragment key={locale}>{children}</React.Fragment>
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = React.useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n() must be used within <I18nProvider>");
  }
  return ctx;
}

export { interpolate };
export type { TranslateParams };
