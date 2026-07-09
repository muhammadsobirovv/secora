# ADR 0002 — Workspace Foundation module (Module 2) architecture and implementation decisions

Status: accepted, implemented.
Context: `PROJECT_SPEC.md`, ADR 0001 (`docs/adr/0001-auth-module.md`), plan
at implementation time
(`/home/kali/.claude/plans/lucky-spinning-tarjan.md`).

This records the decisions made building the Workspace Foundation
backend (Projects/Targets/Notes/Evidence/Attachments/Tags/Activity/
Search) and the first real frontend (a Next.js dashboard covering Module
1's auth plus all of the above). Grouped the same way as ADR 0001:
**planned** (agreed before writing code) vs. **discovered** (surfaced by
actually running the code).

---

## Planned decisions

### 1. `Organization`/`OrganizationMember` renamed to `Workspace`/`WorkspaceMember`

Confirmed with the user before writing the plan. Matches the master
spec's own vocabulary ("Personal Workspace" under User Dashboard vs.
"Private organizations" as a separate, later Future Feature) and avoids
a permanent terminology mismatch every future module would otherwise
have to carry. Table names (`@@map`) updated to match; every Module 1
reference (`register.use-case.ts`, `oauth-login.use-case.ts`,
`app.module.ts`, `seed.ts`, both use-case spec files) updated. Behavior
unchanged — only names.

### 2. CQRS via `@nestjs/cqrs`

The standard NestJS package for `CommandBus`/`QueryBus`/`EventBus`, used
without event-sourcing or sagas (opt-in features left unused).
`CqrsModule.forRoot()` registered once globally in `AppModule` — no
per-feature-module import needed. Aggregates stay plain Prisma-typed
data (per Module 1's precedent); handlers call repository interfaces
directly.

### 3. Domain events drive the Activity Timeline

Every significant command publishes a domain event
(`ProjectCreatedEvent`, `TargetCreatedEvent`, ...) after its write
succeeds. Every Module 2 event class implements a shared
`ActivityDomainEvent` interface
(`common/events/activity-domain-event.interface.ts`:
`{ workspaceId, projectId, actorUserId, verb, entityType, entityId,
metadata? }`). One `ActivityRecordingHandler` in the `activity` module
subscribes to all of them via a single `@EventsHandler(EventA, EventB,
...)` decorator listing every event class. This is what makes the
timeline generic enough for future modules: Recon/AI/etc. only need to
publish their own events later, not modify `activity`.

### 4. `Attachment` and `ActivityEvent` are polymorphic

`attachableType`/`attachableId` and `entityType`/`entityId` string
columns, no DB-level FK to the parent — unlike every other Module 1/2
relation, which uses real FKs. `Attachment` needs to attach to five
parent types (Workspace/Project/Target/Note/Evidence); `ActivityEvent`
needs to reference entity types the schema doesn't know about yet. The
tradeoff (no DB-enforced referential integrity, no cascade delete) is
acceptable because both tables are supplementary/append-mostly data, not
the source of truth for anything.

### 5. Frontend auth token storage

Access token in a Zustand store (memory only), refresh token in
`localStorage`, plus a plain non-httpOnly marker cookie
(`pentesthub_session`) so `proxy.ts` (Next 16's renamed
`middleware.ts`) can do UX-only edge redirects. The real security
boundary remains the backend's JWT validation on every request — the
cookie is never trusted for authorization, only for "should this
request even reach the client bundle before a flash of the wrong
screen." `apiFetch()` auto-refreshes on 401 (coalescing concurrent
refreshes via a shared promise) and `SessionRestorer` does a silent
refresh on app load if a refresh token is present.

### 6. Markdown editor: split-pane textarea + live preview

`react-markdown` + `remark-gfm` (tables/checklists/autolinks) +
`rehype-highlight` (code blocks), not a WYSIWYG rich-text editor
(TipTap/Lexical). Meets every explicit requirement with a much smaller
dependency footprint. Auto-save is debounced (1.2s) per field, only
firing when content actually diverges from the last-saved value.
"Internal references" ships as plain markdown links to in-app routes for
v1 — no autocomplete/backlink graph yet.

### 7. "No direct feature imports" clarified during implementation

Enforced as: no module imports another feature module's repositories,
services, or command/query handlers. Two things are explicitly *not*
violations: (a) hierarchical "upward" dependencies (child→parent:
Targets/Notes/Evidence/Attachments → Projects → Workspaces; anything →
Tags) since the dependency is one-directional and no cycle exists, and
(b) the `activity` module importing other modules' *event classes* to
register `@EventsHandler`s (an event class is a published contract, same
category as a shared DTO). `Note`/`Evidence`'s optional `targetId` is
validated **not** by importing `TargetsRepository`, but by letting the
real DB foreign key reject an unknown `targetId` (Prisma throws `P2003`,
caught and mapped to `AppException('INVALID_REFERENCE', ...)` via
`runOrMapInvalidReference()`). `Attachments` is the one module allowed
many sibling repository imports, since attaching files to other
resources is its literal job.

### 8. One small Module 1 touch-up bundled in

`UserPreferences` gets a `PATCH /users/me/preferences` command +
endpoint. Without it, Settings → Preferences/Theme would be non-functional
UI over a table nothing could write to. Everything else in Module 1 is
untouched besides the Workspace rename.

### 9. Header notifications are a visual stub

Bell icon, dropdown, "No notifications yet" empty state, no backend.
There is no `Notification` model and no delivery mechanism — building
one is a real feature, not workspace foundation.

### 10. `StorageService`/`SearchService` behind ports, one adapter each

`StorageService` (Module 1, already `upload`/`getUrl`/`delete`, no
local-path assumptions leaking through) gets its first real consumers
this sprint (workspace avatars, attachments) — no interface changes
needed. `SearchService` gets the identical treatment: `SEARCH_SERVICE`
token, `search(query, workspaceId): Promise<SearchResult[]>` interface,
one `PrismaIlikeSearchService` implementation
(case-insensitive `contains` across Project/Target/Note/Evidence, top 10
per type, 160-char snippets). S3/R2/MinIO/Azure/GCS and
Meilisearch/Typesense/Elasticsearch are new adapter classes behind the
same interfaces later — feature modules only ever depend on the port.

### 11. `AuditEvent` and `ActivityEvent` stay fully separate

`AuditEvent` (Module 1) is immutable security/compliance logging;
`ActivityEvent` (Module 2) is user-facing collaboration history.
Different audiences, different retention needs, different consumers.
`AuditModule` and `activity` remain independent — nothing in this sprint
reads or writes across that boundary.

### 12. Five optional forward-compat fields

`Workspace.plan` (future billing tier, unread by anything this sprint),
`Project.visibility` (`PRIVATE|WORKSPACE|PUBLIC`, defaults to
`WORKSPACE`, not yet enforced — access control still runs on
`ProjectMember`/`WorkspaceMember`), `Target.customFields Json?` (escape
hatch for Recon/future-module per-target data without a schema change),
`Evidence.checksum String?` (SHA-256 hex, computed at upload time,
verified live against `hashlib.sha256` in Python during manual testing).

### 13. Frontend feature-folder organization

`features/{auth,workspace,projects,targets,notes,evidence,attachments,
tags,activity,search}/{components,hooks,validators}` — each feature owns
its pieces and only imports from `components/ui`, `components/common`,
and `lib/`, mirroring the backend's "no direct feature imports" rule on
the frontend side.

### 14. Targets/Notes/Evidence have no workspace-wide "list all" endpoint

Deliberate: these are project-scoped resources by design (an engagement's
targets belong to that engagement), and a flat cross-project list isn't
how pentest work is actually organized. The frontend's top-level
`/targets`, `/notes`, `/evidence` sidebar entries reflect this honestly
— they render a `ProjectPicker` ("choose a project to continue") rather
than faking a global list the API doesn't provide, landing on that
project's detail page with the relevant tab pre-selected via a `?tab=`
query param.

---

## Discovered during implementation

### D1. `@Transactional()` + `EventBus.publish()` race

`UploadAttachmentHandler.execute()` was originally `@Transactional()`
end-to-end and called `this.eventBus.publish(...)` from inside it.
`ActivityRecordingHandler.handle()` (subscribed to
`AttachmentUploadedEvent`) hit `P2028: Transaction already closed`
because `@nestjs/cqrs`'s `EventBus.publish()` doesn't await handler
completion — the outer transaction committed and closed before the
async handler's DB call actually ran. Found via e2e, not code review.
Fixed by extracting a private `@Transactional()` `writeAttachment()`
method containing only the DB writes; the public non-transactional
`execute()` awaits it fully before publishing. This pattern generalizes:
any handler that both writes inside a transaction and publishes a domain
event must not publish from inside the transactional scope.

### D2. Real Prisma migration history was achievable after all

ADR 0001 (D8) documented `migrate dev`'s shadow-database flow as
unsupported against the local pglite dev server, falling back to
`db push`. This sprint found the actual gap was narrower: `prisma
migrate diff --from-empty --to-schema <path> --script` (generates a
migration file) and `prisma migrate deploy` (applies it) both need no
shadow-DB connection — only `migrate dev`'s interactive flow does. A
real baseline migration
(`prisma/migrations/20260101000000_init/migration.sql`) now exists.

### D3. Jest parallel workers vs. pglite, recurring with a 2nd e2e spec file

Same class of issue as ADR 0001 D9, now surfacing at the e2e tier: running
`auth.e2e-spec.ts` + `workspace-foundation.e2e-spec.ts` together without
`--runInBand` caused an intermittent 500 on `POST /auth/verify-email`
(passed fine in isolation). Fixed by adding `--runInBand` to
`test:e2e` (previously only `test:integration` had it) — this is a
standing rule now: any Jest suite in this repo that opens real pglite
connections needs `--runInBand`, regardless of tier.

### D4. Monorepo package resolution: raw-TS-source sharing breaks across a bundler boundary

`packages/shared`'s `package.json` pointed `main`/`exports` at raw
`./src/index.ts`. Its internal imports use NodeNext-style `.js`
extensions (required for `apps/api`'s `tsc`/NodeNext resolution). Turbopack
(`apps/web`, via `transpilePackages`) could not resolve those same
`.js`-to-`.ts` mappings, crashing every route with `Module not found`.
Fixed properly (not a workaround) by giving `packages/shared` a real
build step: `"main": "./dist/index.js"`, `"types": "./dist/index.d.ts"`,
`tsc` build script, `turbo.json`'s existing `dependsOn: ["^build"]`
composes correctly. Lesson: a shared package consumed by both a
NodeNext-resolution backend and a bundler-resolution frontend needs a
real compiled output — raw source sharing only works when both consumers
use compatible resolution.

### D5. `apps/web`'s own imports had the same `.js`-extension mistake, copy-pasted from the backend

After fixing D4, the identical error class reappeared pointing at
`apps/web/lib/api/*.ts`'s own relative imports. Root cause: the backend's
NodeNext convention was copy-pasted out of habit; `apps/web`'s tsconfig
uses `moduleResolution: "Bundler"` (extension-optional, incompatible
convention). Fixed across all 11 files in `lib/api/`.

### D6. turbo.json: `build` and `check-types` race on `.next/` for the same package

`check-types` (`next typegen && tsc --noEmit`) and `build` (`next
build`) had no ordering relationship for the `web` package — both
`dependsOn` only referenced `^build`/`^check-types` (dependency
packages), not each other within the same package. Running the full
`pnpm turbo run build lint check-types test` pipeline intermittently
failed with `error TS6053: File '.next/types/cache-life.d.ts' not
found`, since both tasks write into `.next/` concurrently. Running
`check-types` alone (not parallel with `build`) always passed cleanly,
confirming it was a scheduling race, not a code defect. Fixed by adding
`"build"` (same-package) to `check-types`'s `dependsOn` in `turbo.json`,
forcing `web:build` to finish before `web:check-types` starts whenever
both are requested together.

### D7. `Select`/form components needed real primitives, not stubs

Every shadcn-style UI primitive (`AlertDialog`, `Select`, `Tabs`,
`DropdownMenu`, `Popover`, `Tooltip`) was hand-built on top of its real
`@radix-ui/react-*` package rather than approximated with plain HTML —
confirmed necessary the first time `AlertDialogContent` was referenced
before `@radix-ui/react-alert-dialog` was installed and `tsc` failed
immediately. Radix gives focus-trapping, ARIA roles, and Escape/outside-
click handling for free, which matters for the accessibility bar this
module was held to.

### D8. Mobile sidebar was inert before a dedicated review pass

The original `Sidebar` component used one `sidebarCollapsed` boolean for
both a desktop width-collapse and (intended) a mobile toggle. Below the
`md` breakpoint the `<aside>` carried an unconditional `hidden` class, so
the header's hamburger button toggled state that had zero visible effect
on mobile — the sidebar was simply unreachable on small screens. Caught
during the polish pass, not by any automated check (TypeScript and
ESLint have no way to know a CSS class makes a button inert). Fixed by
splitting into two independent concerns: `mobileSidebarOpen` (a real
slide-in drawer with backdrop, below `md`) and removing the never-wired
desktop collapse state entirely rather than leaving dead code.

---

## Explicitly out of scope this sprint

Recon, AI Assistant, Pentest Toolkit, Report Generator, Browser
Extension, CLI, Bug Bounty modules (per explicit instruction — every new
entity here is domain-agnostic storage; a `Target` is a typed string plus
metadata, no scanning or recon logic attached). API key issuance
endpoints (schema exists from Module 1, UI shows an honest "coming soon"
rather than a fake list). A dedicated Playwright/browser automated test
suite (verified live instead, per the plan's testing-scope section).
Workspace-wide "list all targets/notes/evidence" endpoints (Decision 14).
Desktop sidebar collapse UI (state existed, never had a real trigger;
removed rather than half-built).
