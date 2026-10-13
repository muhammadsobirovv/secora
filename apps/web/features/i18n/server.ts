import { cookies, headers } from "next/headers";
import type { Locale } from "@pentesthub/shared";
import { translate, type TranslateFn } from "./catalog";
import { LOCALE_COOKIE, resolveLocale } from "./locale";

/// Server-component counterpart of useI18n(): resolves the request's
/// locale from the `phai.locale` cookie, then Accept-Language, then "en",
/// and exposes the same catalogs. Reading cookies/headers makes the
/// calling route dynamic, which is exactly what per-request language needs.
export async function getLocale(): Promise<Locale> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  return resolveLocale({
    cookie: cookieStore.get(LOCALE_COOKIE)?.value,
    acceptLanguage: headerStore.get("accept-language"),
  });
}

export function getT(locale: Locale): TranslateFn {
  return (key, params) => translate(locale, key, params);
}

/// Convenience for server components: `const { locale, t } = await getServerI18n()`.
export async function getServerI18n(): Promise<{ locale: Locale; t: TranslateFn }> {
  const locale = await getLocale();
  return { locale, t: getT(locale) };
}
