import type { Locale } from "@pentesthub/shared";

/// Plural forms for count-based UI strings, chosen with Intl.PluralRules so
/// Russian gets one/few/many (1 находка, 2 находки, 5 находок) and Uzbek and
/// English get one/other.
///
/// Key format — a plural group is four catalog keys that share a base:
///
///   "recon.progress.findings_one"   (1, 21, 101 in ru)
///   "recon.progress.findings_few"   (2–4, 22–24 in ru)
///   "recon.progress.findings_many"  (0, 5–20, 25 in ru)
///   "recon.progress.findings_other" (fractions, and the fallback)
///
/// Every locale defines all four suffixes, so the en/uz/ru key sets stay
/// identical (scripts/check-i18n.mjs). A category a language never uses
/// mirrors its `_other` text. A missing form falls back to `_other`.
///
/// Call sites: `plural("recon.progress.findings", count, { count })` from
/// useI18n(), which resolves the active locale.

export const PLURAL_SUFFIXES = ["one", "few", "many", "other"] as const;
export type PluralSuffix = (typeof PLURAL_SUFFIXES)[number];

/// Intl locale tag per app locale. Uzbek is Latin script.
const INTL_TAG: Record<Locale, string> = { en: "en", uz: "uz-Latn", ru: "ru" };

/// Maps the count to one of the four suffixes. `zero` and `two` do not occur
/// for en/uz/ru, but if they did they would use `_other`.
export function pluralSuffix(locale: Locale, count: number): PluralSuffix {
  const category = new Intl.PluralRules(INTL_TAG[locale]).select(count);
  return category === "one" || category === "few" || category === "many" ? category : "other";
}

/// Picks the catalog key for a count. `has` reports whether a key exists in
/// the catalog; when the chosen form is missing the `_other` form is used.
export function resolvePluralKey(
  locale: Locale,
  base: string,
  count: number,
  has: (key: string) => boolean,
): string {
  const suffix = pluralSuffix(locale, count);
  const key = `${base}_${suffix}`;
  return has(key) ? key : `${base}_other`;
}
