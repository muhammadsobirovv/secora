import { DEFAULT_LOCALE, type Locale } from "@pentesthub/shared";
import en from "./messages/en.json";
import uz from "./messages/uz.json";
import ru from "./messages/ru.json";

/// The three message catalogs and the lookup used by both the client
/// provider (useI18n) and server code (getT in ./server). English is the
/// source of truth: its keys define MessageKey, and any key missing from
/// another language falls back to English at runtime (the CI check in
/// scripts/check-i18n.mjs makes sure that never actually happens).
export type Messages = typeof en;
export type MessageKey = keyof Messages;

export const CATALOGS: Record<Locale, Messages> = { en, uz, ru };

export type TranslateParams = Record<string, string | number>;

/// Replaces {name} placeholders. Unknown placeholders are left untouched
/// so a missing parameter is visible rather than silently blank.
export function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

export function translate(locale: Locale, key: MessageKey, params?: TranslateParams): string {
  const template = CATALOGS[locale][key] ?? CATALOGS[DEFAULT_LOCALE][key] ?? key;
  return interpolate(template, params);
}

export type TranslateFn = (key: MessageKey, params?: TranslateParams) => string;
