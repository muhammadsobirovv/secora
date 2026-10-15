Task: i18n Phase 2 — convert the remaining user-visible hardcoded strings to the t() catalog (en/uz/ru), and make auth errors translatable. Phase 1 is already committed (c25e629). Do NOT redo Phase 1 areas (dashboard, header, sidebar, breadcrumbs, menus, command palette, notifications, activity feed, project card, settings/preferences).

Rules
- Single commit author = the user. NO Co-Authored-By trailers.
- LOCAL ONLY. Do not deploy, do not touch the server, DNS, or git remote. Do not push. Verify on http://127.0.0.1:13001 (web) and 127.0.0.1:13000 (API) — the local E2E stack.
- Do not commit unrelated working-tree changes. Stage only files you changed for i18n. Known unrelated files that must NOT be staged: pnpm-lock.yaml, docker-compose.yml, turbo.json, recon/desktop files, and the .gitignore ssh_keys/*.key lines. If a file you need also contains unrelated edits, stop and report instead of staging it.
- Keep en/uz/ru key sets identical (check-i18n enforces this).
- Uzbek: Latin script, natural phrasing. Russian: natural, not literal. List any uncertain translations in your final report.

Scope (in this order, one commit per group)
1. Feature pages: Recon (jobs list, create, job detail, progress, live logs, findings, scan history), Vulnerabilities, Bug Bounty (programs, findings, reports, submissions, rewards), SOC, AI assistant/copilot, Knowledge base, Terminal, Playbooks.
2. Settings, Billing, Pricing, Usage, Admin console, Org/workspace settings.
3. Login, register, forgot/reset password, MFA prompts, OAuth buttons, onboarding, demo banner, error pages (404/500), toasts, form validation messages, empty states, table headers, status badges, relative time ("4 weeks ago") via Intl.RelativeTimeFormat with the active locale.
4. Auth error codes from the API: add stable codes for wrong password, email taken, MFA required/invalid, account locked, OAuth failures. Frontend maps codes to t() keys. Do not show raw backend English messages to users.

Do NOT translate
- User-entered data (workspace names, project names, target domains, finding titles written by users).
- Proper nouns and tool names (PentestHub AI, Nmap, Amass, Burp, Sigma, Cloudflare, Google, GitHub, Telegram).
- Log output and raw technical identifiers shown in code blocks.

Method
- Inventory first: grep app/, features/, components/ for JSX text, placeholder=, aria-label=, title=, toast/notify calls, and literal error strings. Save the list to a file under the outputs folder for your report.
- Convert in batches; after each batch run: pnpm --filter web check-types && pnpm --filter web lint (lint runs check-i18n: key parity, unknown t() keys, and literal count must not exceed baseline — lower the baseline after each group, never raise it).
- Use namespaced keys (feature.area.label). Reuse common.* keys (save, cancel, delete, search, loading, error) instead of duplicating.

Verification (real browser, local stack)
1. Set language RU on the landing page, log in, visit each converted feature page. Report any remaining English text you see (screenshot or get_page_text).
2. Repeat for UZ.
3. Trigger at least: wrong password, duplicate email on register, validation errors on one form, a 404 page. Confirm translated messages in RU and UZ.
4. Run: pnpm --filter web build. Run the API tests for the auth error-code change (the touched spec files) and the API typecheck.
5. Grep report: count of remaining hardcoded literals before and after, plus the check-i18n output.

Deliverables
- One commit per group, author = the user, no Co-Authored-By. Do not push.
- Final report: commits (hashes), files touched, strings converted, remaining untranslated areas, uncertain Uzbek/Russian strings for the user to review, verification results, anything you could not verify.
