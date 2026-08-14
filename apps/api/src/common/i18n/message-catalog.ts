import { DEFAULT_LOCALE, type Locale } from '@pentesthub/shared';

/// Module 15 — task #348 "i18n architecture — English/Uzbek/Russian".
///
/// A deliberately small, hand-written catalog of *backend-generated*
/// user-facing strings — the kind that get persisted (notification titles/
/// bodies, future email subjects) and therefore need to be translated at
/// write time, server-side, based on the recipient's locale. This is NOT
/// where the rest of the API's error messages or the frontends' UI copy
/// live — see `docs/architecture/i18n.md` for the full picture and for why
/// a blanket retrofit of every existing hardcoded string across
/// apps/api/apps/web/apps/desktop/apps/mobile is explicitly out of scope
/// for this task (it would mean rewriting nearly every previously-shipped
/// component, which the project's standing instructions rule out except
/// where integration/bug-fixing requires it).
///
/// `BugBountyDeadlineNotifierService` (task #338/#9) is this catalog's
/// first real caller, wired end-to-end as the reference implementation for
/// any future module that wants to translate a persisted, user-facing
/// string: resolve the recipient's locale (see `locale.util.ts`), then call
/// `translate(key, locale, params)` instead of building the string inline.
export type MessageKey =
  | 'bugbounty.deadline.overdueTitle'
  | 'bugbounty.deadline.upcomingTitle'
  | 'bugbounty.deadline.body'
  | 'bugbounty.deadline.bodyWithNotes';

type MessageParams = Record<string, string>;
type MessageResolver = (params: MessageParams) => string;

const CATALOG: Record<Locale, Record<MessageKey, MessageResolver>> = {
  en: {
    'bugbounty.deadline.overdueTitle': (p) => `Overdue: ${p.eventTitle}`,
    'bugbounty.deadline.upcomingTitle': (p) => `Upcoming: ${p.eventTitle}`,
    'bugbounty.deadline.body': (p) => `Due ${p.dueAt}`,
    'bugbounty.deadline.bodyWithNotes': (p) => `Due ${p.dueAt} — ${p.notes}`,
  },
  uz: {
    'bugbounty.deadline.overdueTitle': (p) => `Muddati o'tgan: ${p.eventTitle}`,
    'bugbounty.deadline.upcomingTitle': (p) => `Yaqinlashib kelmoqda: ${p.eventTitle}`,
    'bugbounty.deadline.body': (p) => `Muddati: ${p.dueAt}`,
    'bugbounty.deadline.bodyWithNotes': (p) => `Muddati: ${p.dueAt} — ${p.notes}`,
  },
  ru: {
    'bugbounty.deadline.overdueTitle': (p) => `Просрочено: ${p.eventTitle}`,
    'bugbounty.deadline.upcomingTitle': (p) => `Скоро: ${p.eventTitle}`,
    'bugbounty.deadline.body': (p) => `Срок: ${p.dueAt}`,
    'bugbounty.deadline.bodyWithNotes': (p) => `Срок: ${p.dueAt} — ${p.notes}`,
  },
};

/// Falls back to `DEFAULT_LOCALE`'s copy for the same key if `locale` is
/// somehow missing from `CATALOG` (shouldn't happen given `Locale` is a
/// closed union, but this keeps `translate()` total rather than throwing
/// for what would otherwise be a silent notification-delivery failure).
export function translate(key: MessageKey, locale: Locale, params: MessageParams = {}): string {
  const resolver = CATALOG[locale]?.[key] ?? CATALOG[DEFAULT_LOCALE][key];
  return resolver(params);
}
