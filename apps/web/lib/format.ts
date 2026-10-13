import { DEFAULT_LOCALE, type Locale } from "@pentesthub/shared";
import { translate } from "@/features/i18n/catalog";
import { INTL_LOCALE } from "@/features/i18n/locale";

/// Date, time and relative-time formatting in the active UI language.
///
/// The active locale is set by I18nProvider while it renders (so both the
/// server render and the client render of a request format with that
/// request's language) and these functions are plain functions so the ~45
/// existing call sites keep working unchanged. Components that must
/// re-format when the language changes are remounted by the provider.
let activeLocale: Locale = DEFAULT_LOCALE;

export function setFormatLocale(locale: Locale): void {
  activeLocale = locale;
}

export function getFormatLocale(): Locale {
  return activeLocale;
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31536000],
  ["month", 2592000],
  ["week", 604800],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];

const relativeFormatters = new Map<Locale, Intl.RelativeTimeFormat>();
function relativeFormatter(locale: Locale): Intl.RelativeTimeFormat {
  let rtf = relativeFormatters.get(locale);
  if (!rtf) {
    rtf = new Intl.RelativeTimeFormat(INTL_LOCALE[locale], { numeric: "auto" });
    relativeFormatters.set(locale, rtf);
  }
  return rtf;
}

export function formatDistanceToNow(isoDate: string): string {
  const locale = activeLocale;
  const rtf = relativeFormatter(locale);
  const seconds = Math.round((new Date(isoDate).getTime() - Date.now()) / 1000);
  const absSeconds = Math.abs(seconds);

  if (absSeconds < 60) return translate(locale, "common.justNow");

  for (const [unit, secondsInUnit] of UNITS) {
    if (absSeconds >= secondsInUnit) {
      const value = Math.round(seconds / secondsInUnit);
      return rtf.format(value, unit);
    }
  }
  return rtf.format(Math.round(seconds / 60), "minute");
}

export function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString(INTL_LOCALE[activeLocale], {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(isoDate: string): string {
  return new Date(isoDate).toLocaleString(INTL_LOCALE[activeLocale], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}
