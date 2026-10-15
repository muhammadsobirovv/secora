Task: switch the product's public domain from pentesthubai.com (deleted, no longer ours) to secora.group. Code/config/docs only in this task. Server, DNS and nginx changes are a SEPARATE step (Part B) and must NOT be done without the user's explicit go-ahead.

Rules
- Single commit author = the user. NO Co-Authored-By trailers.
- Do NOT push. Local commits only.
- Phase 2 i18n work is in progress on overlapping files (login-form, layout, dashboard, landing). Before starting: git status and git log. If there are uncommitted i18n changes, STOP and report. Do not stage unrelated files (pnpm-lock.yaml, docker-compose.yml, turbo.json, recon/desktop files, .gitignore ssh/*.key lines).
- Do not change the old domain in git history. Only the working tree.

Part A (local, do now)
1. Inventory: grep -rn "pentesthubai" across the repo (excluding node_modules, .git, build output). Save the list to outputs/domain-inventory.txt. Expected ~60 hits in ~27 files.
2. Replace the domain with secora.group in: API CORS defaults and env validation (apps/api/src/config/env.validation.ts and its spec, bootstrap.ts, .env.example), web metadata/sitemap/robots/layout, landing and login pages, legal pages, public/.well-known/security.txt, SECURITY.md, PRIVACY.md, docs/user/*, README if present.
3. Contacts: support@ and security@ become @secora.group. Do not invent other addresses.
4. Legal documents: their content changed (domain and contact address). Bump the legal version in packages/shared/src/legal.ts and apps/mobile/lib/core/legal/legal_version.dart the same way the existing versioning mechanism does, so users are asked to re-accept. Report the old and new version numbers.
5. Keep the GitHub repo URLs and any LinkedIn/X links unchanged unless they point to pentesthubai.com.
6. Do NOT change the product name "PentestHub AI" in this task. The brand rename is a separate decision.
7. Add a redirect note in docs only if the docs describe old URLs; do not add code redirects to the dead domain.

Verification
- pnpm --filter api typecheck, pnpm --filter web check-types, pnpm --filter web lint, pnpm --filter api test for the env validation spec, pnpm --filter web build.
- grep -rn "pentesthubai" again: the only remaining hits must be the report file and git history references you deliberately kept. List them.

Commits (author = the user, no trailers)
- "chore: switch public domain to secora.group" (config, code, metadata, sitemap, env, docs)
- "legal: bump versions for domain change" (legal text + version bump), if it is a separate change.

Part B (ONLY after the user says "server ishlat"; do not start without it)
- Print the nginx server_name and certbot command for secora.group and www.secora.group, and the CORS_ADDITIONAL_ORIGINS value. Show them to the user; do not run them yet.
- OAuth: list the Google and GitHub redirect URIs that must be changed in their consoles (user does this).
- Email: list the Cloudflare Email Routing rules for support@ and security@ and the SPF/DKIM records (user does this).

Final report
- Commit hashes, files changed count, old->new version numbers for legal docs, the remaining grep hits, which Part B items are waiting for the user.
