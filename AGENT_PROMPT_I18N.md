Task: make the language choice (EN/UZ/RU) apply everywhere, and persist it. Today, after picking RU, only the sidebar nav is Russian; the dashboard page ("Welcome back", PROJECTS, FAVORITES, Recent projects, Workspace, Recent activity...) and /docs stay English. Single commit author = the user, NO Co-Authored-By trailers. Build/lint/typecheck, verify in a real browser. NOTE: the production domain no longer exists and we are NOT deploying right now. Work and verify LOCALLY only (http://localhost:3000 web, local API). Do not touch the server, DNS or git remote. Commit locally; do not push unless the user says so.

## Root causes (verified in code)
1. `apps/web/features/i18n/i18n-context.tsx` keeps the locale ONLY in `localStorage["phai.language"]`, read in a client effect. Server components (e.g. everything under `apps/web/app/docs/**`, metadata, server-rendered pages) cannot see it, so they always render English. It also flashes the default locale on first paint.
2. Only ~9 files call `t()` (nav-item, landing-page, preferences page, legal view, language switcher, marketing mocks). All dashboard pages and most features contain hardcoded English strings. `docs-language-note.tsx` exists but docs content is not localized.
3. The authenticated `UserPreferences.language` (server) is not the source of truth on login, so a user's choice is not carried across devices/browsers.

## Required behavior
- One choice, applied everywhere: marketing site, /login, /register, dashboard, settings, /docs, /legal/*, error pages, emails if any.
- Persisted: cookie first (so the server can read it), localStorage as mirror, and for signed-in users also `UserPreferences.language` via the existing preferences endpoint. On login, server preference wins and overwrites the cookie/localStorage; on change, update all three.
- No wrong-language flash on first paint (SSR must already render the right language).
- Fallback order: cookie -> user preference -> Accept-Language header -> "en".

## Implementation plan
A. Locale source of truth
  - Add cookie `phai.locale` (path=/, SameSite=Lax, 1 year, not httpOnly since the client switcher sets it; Secure in production).
  - In `app/layout.tsx` (server) read the cookie via `cookies()` / `Accept-Language` fallback, set `<html lang>` server-side, and pass `initialLocale` into `I18nProvider` so the first client render already matches (remove the "start at DEFAULT_LOCALE then settle" effect that causes the flash).
  - `setLocale` writes cookie + localStorage, updates `<html lang>`, and when authenticated PATCHes `/users/me/preferences { language }`. Then call `router.refresh()` so server components re-render in the new language.
  - On auth bootstrap/login: if preferences.language differs from the cookie, adopt the server value and refresh.
  - Add a small server helper `getLocale()` + `getT(locale)` usable in server components (shared catalogs, same keys).

B. Catalog coverage (the big part)
  - Inventory every user-visible hardcoded string in `apps/web/app/**` and `apps/web/features/**` and `apps/web/components/**` (JSX text, placeholders, aria-labels, toasts, table headers, empty states, button labels, validation messages, date/relative-time text like "4 weeks ago", status badges like "Active"). Convert them to `t()` keys, namespaced (e.g. `dashboard.welcome`, `dashboard.stats.projects`, `common.search`, `common.newProject`, `activity.*`).
  - Start with the pages visible in the screenshot: Dashboard (welcome, stat cards, Recent projects/View all, Workspace card with Overview/Settings, Recent activity and its event names such as "Target Updated", "Recon_job Completed" which should be mapped from event types to human labels, not raw enum text), top bar (Search placeholder), then Recon, Vulnerabilities, Bug Bounty, SOC, AI, Settings, Billing/Pricing, Admin, login/register.
  - Dates/numbers/relative time: use `Intl.DateTimeFormat` / `Intl.RelativeTimeFormat` with the active locale instead of English strings.
  - Keep en/uz/ru JSON key sets IDENTICAL. Add a unit test (or lint script run in CI) that fails if any key is missing in any language or if a catalog has extra keys.
  - Add an ESLint rule or a simple grep-based CI check (e.g. `react/jsx-no-literals` limited to app/ and features/ with an allowlist) to prevent new hardcoded UI strings.
  - Uzbek translations: Latin script, natural phrasing (not machine-literal). Russian and Uzbek can be machine-assisted but must read naturally; list any uncertain strings in the final report for the user to review.

C. Docs and legal pages
  - /docs: the pages are server-rendered from markdown. Support localized content: `docs/<slug>.<locale>.md` (or a `locales/<locale>/` tree). The loader picks the file for the active locale (server cookie) and falls back to English with a visible banner ("This page is not yet translated" in the active language) when a translation is missing. The docs sidebar/titles/index must be translated too.
  - Translate at least the user-facing docs set (Getting Started, scanning guide, bug bounty, AI, ROE/responsible use, security policy) into uz and ru. If the docs trim from AGENT_PROMPT_DOCS_LEGAL.md has already been done, use that allowlist; if not, apply to what is currently published.
  - /legal/* and /security: same mechanism, all three languages.
  - The language switcher must also be present in the docs header and on the legal pages.
  - hreflang: add `<link rel="alternate" hreflang>` only if URLs are per-locale; since we use a cookie (same URL), do NOT add hreflang. Keep one canonical URL per page.

D. Backend-originated text
  - API error messages and validation messages shown to the user: either return stable error codes and map them to translated strings in the frontend, or send `Accept-Language` / the `phai.locale` cookie to the API and localize server messages. Prefer codes + frontend mapping. At minimum make sure auth errors (wrong password, email taken, MFA) are translated.

## Verification (real browser, not just build)
1. Clear cookies/localStorage, open http://localhost:3000 with browser language = en: English. Switch to RU on the landing page, log in: dashboard, sidebar, top bar, tables, empty states, settings and /docs are ALL Russian with no English leftovers except proper nouns (PentestHub AI, tool names). Repeat for UZ.
2. Hard reload and open in a new tab: language persists, no flash of English.
3. Log in from a second browser: the language chosen on the first one is applied (server preference).
4. `/docs`, `/legal/terms`, `/security` follow the language; missing translation shows the fallback banner.
5. Report: number of strings converted, list of files touched, remaining untranslated areas (if any), and the CI check that prevents regressions. Do not claim "everything is translated" without grepping for leftover literals and attaching the grep result.

Do the work in phases and make a local commit after each so the user can check (no deploy): (1) locale source of truth + dashboard + top bar, (2) remaining app pages, (3) docs/legal localization.
