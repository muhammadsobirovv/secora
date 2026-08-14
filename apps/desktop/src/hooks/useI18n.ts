import { create } from "zustand";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@pentesthub/shared";
import en from "../i18n/messages/en.json";
import uz from "../i18n/messages/uz.json";
import ru from "../i18n/messages/ru.json";

/// Module 15 — task #348 "i18n architecture — English/Uzbek/Russian".
///
/// Mirrors `useThemeStore.ts`'s exact shape (Zustand store + localStorage
/// persistence + a module-level `initial*` read at import time) — this
/// codebase's established convention for a per-machine display/UI
/// preference, not something that needs to round-trip through the Rust
/// `settings` table or Sync. `AppearanceSettings.tsx`'s language `<select>`
/// already wrote to the same `phai.language` key (see its own doc
/// comment: "the integration point once [i18n] lands, not a no-op") —
/// this store is that landing, wired into the same key so the existing
/// persisted choice is picked up rather than reset.
type Messages = typeof en;
const CATALOGS: Record<Locale, Messages> = { en, uz, ru };

const STORAGE_KEY = "phai.language";

interface I18nState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: keyof Messages) => string;
}

function detectInitialLocale(): Locale {
  const stored = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
  if (stored && isSupportedLocale(stored)) return stored;
  return DEFAULT_LOCALE;
}

function translateFor(locale: Locale) {
  return (key: keyof Messages): string => CATALOGS[locale][key] ?? CATALOGS[DEFAULT_LOCALE][key];
}

const initialLocale = detectInitialLocale();

export const useI18nStore = create<I18nState>((set) => ({
  locale: initialLocale,
  t: translateFor(initialLocale),
  setLocale: (locale) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, locale);
    }
    set({ locale, t: translateFor(locale) });
  },
}));
