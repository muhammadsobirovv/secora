# Module 2 Release Notes — Workspace Foundation + Dashboard UI

Commits: `ddd0524` (backend), `6fa4c14` (frontend).
Full decision record: `docs/adr/0002-workspace-foundation-module.md`.

## Features added

**Backend** — Workspace Foundation, the storage layer every future
module (Recon, AI, Bug Bounty, Reports) will attach to:
- Workspaces (renamed from Organizations): settings, avatar upload, member listing.
- Projects: create/update/archive/restore/soft-delete/favorite, status, visibility, tags, members.
- Targets: 8 types (domain/subdomain/URL/IP/CIDR/API/mobile app/internal asset), environment, scope status, tags — no scanning or recon logic attached.
- Notes: markdown content, optional target linkage.
- Evidence: 6 types (screenshot/HTTP request/HTTP response/file/log/video), SHA-256 checksums on upload.
- Attachments: polymorphic file uploads across Workspace/Project/Target/Note/Evidence.
- Tags: workspace-scoped, applicable to Projects and Targets.
- Activity Timeline: event-driven, records every create/update/archive/delete/favorite/upload action.
- Search: cross-resource (Project/Target/Note/Evidence) query endpoint.
- `PATCH /users/me/preferences` (theme/timezone/notifications) — small Module 1 extension.

**Frontend** — first real UI for the product:
- Full Auth flow: login, register, forgot/reset password, email verification, MFA challenge, OAuth (Google/GitHub).
- Dashboard shell: sidebar, header, workspace switcher, command palette (Cmd/Ctrl+K), keyboard shortcuts, mobile slide-in drawer.
- Dashboard home: stat cards, recent projects, recent activity, quick actions.
- Full CRUD UI for Projects (cards/table views), Targets, Notes (markdown split-pane editor with debounced auto-save), Evidence (with attachments panel).
- Workspace-wide Activity timeline.
- Settings: Profile, Security (password + MFA setup/disable), Sessions (list/revoke), API Keys (honest "coming soon"), Preferences, Workspace.
- Dark-mode-first, responsive, loading skeletons, empty/error states, toast notifications throughout.

## Architectural improvements

- **CQRS** (`@nestjs/cqrs`) established as the standing pattern for all future feature modules — `CommandBus`/`QueryBus`/`EventBus`, one command/query per file, no event-sourcing overhead.
- **Event-driven Activity Timeline**: any future module can plug into activity recording just by publishing a domain event that implements `ActivityDomainEvent` — no changes to the `activity` module required.
- **`StorageService`/`SearchService` behind swappable ports**: both got their first real consumers this sprint (local-disk storage, Prisma ILIKE search); S3/R2/Meilisearch/etc. are new adapter classes later, not feature-module rewrites.
- **"No direct feature imports" rule** proven out across 8 new modules — cross-module reads go through real DB foreign keys (caught and mapped to clean errors) or the CQRS bus, never direct repository imports.
- **`packages/shared` given a real build step** (compiles to `dist/`) so one package can be safely consumed by both the NodeNext-resolution backend and the Turbopack-bundled frontend — a pattern any future shared code needs to follow.
- **`turbo.json` ordering fix**: `check-types` now waits on the same package's `build` — prevents a `.next/` race that only surfaces once a package has both tasks doing real work.

## Breaking changes

- `Organization` / `OrganizationMember` / `OrgMemberRole` renamed to `Workspace` / `WorkspaceMember` / `WorkspaceMemberRole` (schema + every Module 1 reference). No externally-facing API existed yet for these under the old name, so this is breaking only against local dev databases seeded before this module — re-run `prisma db push` (or apply the new baseline migration) and reseed.
- None of Module 1's authentication endpoints or contracts changed.

## Known limitations

- No workspace-wide "list all targets/notes/evidence" endpoint — these resources are project-scoped by design (matches how pentest engagements are actually organized); the frontend's top-level nav entries reflect this honestly via a project picker rather than faking a global list.
- API key issuance has no backend endpoints yet (Module 1 schema only) — Settings shows an honest "coming soon" state.
- Header notifications are a visual stub — no `Notification` model or delivery mechanism yet.
- No automated browser/E2E test suite for the frontend this sprint (verified live via build + full HTTP-level flow testing instead); a Playwright suite is a reasonable future addition.
- Visual/interactive browser verification of the dashboard was not completed in the build environment (missing system libraries for headless Chromium, blocked on a `sudo` install) — verification instead relied on a clean production build (all 27 routes), full lint/typecheck/test pass, and a live curl-driven flow against the real API.

## Recommended next module

**Recon Module** (WHOIS/DNS/subdomain enumeration/tech fingerprinting), per the existing rollout order in `PROJECT_SPEC.md`. It's the first module that actually populates Targets with real data (via `Target.customFields`, reserved for exactly this) and will exercise the Activity Timeline and Attachments/Evidence pipeline under real usage for the first time.
