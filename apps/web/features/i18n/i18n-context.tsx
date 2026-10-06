"use client";

import * as React from "react";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@pentesthub/shared";
import en from "./messages/en.json";
import uz from "./messages/uz.json";
import ru from "./messages/ru.json";

/// Module 15 — task #348 "i18n architecture — English/Uzbek/Russian".
///
/// A deliberately small, hand-rolled provider — plain React context + a
/// handful of starter JSON catalogs — rather than pulling in next-intl or
/// react-intl as a new dependency. Two reasons: (1) this pass establishes
/// the *architecture*, not a full retrofit of every hardcoded string
/// across the app (see `docs/architecture/i18n.md` for the explicit scope
/// boundary and why), so the extra surface area of a full i18n library
/// isn't earning its keep yet; (2) adding a new npm dependency here would
/// need a `pnpm install` this session had no way to verify completes
/// within the sandbox's confirmed ~170s tool-call ceiling — safer to ship
/// something small, real, and fully verified than something unverified.
///
/// Deliberately does NOT depend on `usePreferences()` (the authenticated
/// `/users/me/preferences` query) — this provider mounts at the app root
/// in `Providers`, which wraps logged-out routes (login, register) too.
/// Locale state lives in `localStorage` (key mirrors the desktop app's
/// `phai.language` — see apps/desktop's `AppearanceSettings.tsx` — so a
/// user's choice reads the same way across both surfaces) with a graceful
/// `navigator.language` fallback for a first-ever visit. The settings page
/// is what layers the authenticated `UserPreferences.language` sync on
/// top, exactly the way it already does for `theme` via `next-themes`.
const STORAGE_KEY = "phai.language";

type Messages = typeof en;
export type MessageKey = keyof Messages;
const CATALOGS: Record<Locale, Messages> = { en, uz, ru };

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: keyof Messages) => string;
}

const I18nContext = React.createContext<I18nContextValue | null>(null);

function detectInitialLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored && isSupportedLocale(stored)) return stored;

  const browserTag = window.navigator.language?.split("-")[0]?.toLowerCase();
  if (browserTag && isSupportedLocale(browserTag)) return browserTag;

  return DEFAULT_LOCALE;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // Starts at DEFAULT_LOCALE on the server (and on the client's first
  // render, to avoid a hydration mismatch) then syncs to the real stored/
  // detected locale in an effect — same "settle after mount" shape as
  // next-themes uses for the theme class.
  const [locale, setLocaleState] = React.useState<Locale>(DEFAULT_LOCALE);

  React.useEffect(() => {
    setLocaleState(detectInitialLocale());
  }, []);

  // Module 15 — task #349 (accessibility audit): keeps <html lang> in
  // sync with the active locale. Screen readers and browser
  // translate/spell-check features use this attribute to choose
  // pronunciation/language rules — leaving it hardcoded to "en" (as
  // app/layout.tsx's static markup does, since it's a server component
  // with no access to this client-only locale state) would mis-announce
  // Uzbek/Russian UI copy. Same "settle after mount" pattern as
  // next-themes's `class` attribute handling right next to this provider
  // in providers.tsx — both rely on `suppressHydrationWarning` on <html>.
  React.useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = React.useCallback((next: Locale) => {
    setLocaleState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const t = React.useCallback(
    (key: keyof Messages): string => CATALOGS[locale][key] ?? CATALOGS[DEFAULT_LOCALE][key],
    [locale],
  );

  const value = React.useMemo<I18nContextValue>(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = React.useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n() must be used within <I18nProvider>");
  }
  return ctx;
}
