Task: add public contact points to the PentestHub AI website (apps/web). Business emails are already live via Cloudflare Email Routing:
- support@pentesthubai.com  (general support)
- security@pentesthubai.com (vulnerability reports)
Do NOT put any personal Gmail anywhere in the repo, site, JSON-LD or docs.

1. Footer (apps/web/features/marketing/landing-page.tsx): add "Support" -> mailto:support@pentesthubai.com and "Security" contact -> mailto:security@pentesthubai.com next to the existing footer links. Add i18n keys (en/uz/ru) e.g. landing.footer.support, landing.footer.contact. Keep all three language files in sync.

2. security.txt: create apps/web/public/.well-known/security.txt (RFC 9116):
   Contact: mailto:security@pentesthubai.com
   Expires: 2027-10-06T00:00:00.000Z
   Preferred-Languages: en, uz, ru
   Canonical: https://pentesthubai.com/.well-known/security.txt
   Make sure proxy.ts / middleware does not redirect /.well-known/* to login (treat as public), and nginx serves it.

3. JSON-LD (apps/web/app/(dashboard)/page.tsx): on the Organization node add
   contactPoint: [
     { "@type": "ContactPoint", contactType: "customer support", email: "support@pentesthubai.com", availableLanguage: ["en","uz","ru"] },
     { "@type": "ContactPoint", contactType: "security", email: "security@pentesthubai.com" }
   ]
   and top-level "email": "support@pentesthubai.com". Re-validate with the Rich Results / Schema validator (0 errors).

4. Also update SECURITY.md in the repo root: reporting address security@pentesthubai.com (remove any personal address).

4b. docs/operations/primary-admin-verification.md contains a personal Gmail address (lines ~4, 26, 33). Replace every occurrence with a placeholder like `<admin-email>` (or delete the file if it is only an internal log). Then run `git grep -i "sobirovmuhammadjon070"` and fix all remaining hits. Also run `git log --format='%an <%ae>' | sort -u` and report which author/committer emails appear in history; if any is the personal Gmail, use the user's GitHub noreply address (231512668+dotuz@users.noreply.github.com) in the history rewrite and set `git config user.email` to it for future commits.

5. Run build/lint/typecheck, commit as a single commit authored only by the user (no Co-Authored-By trailer), push, deploy. Then verify:
   curl -s https://pentesthubai.com/.well-known/security.txt
   and report the result.
