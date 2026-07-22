# Module 9 — Bug Bounty Platform + Collaboration + Reporting Suite

Status: **Complete**, pending user approval before Module 10 (per the Module 9
spec's closing instruction).

This document is the implementation record for Module 9, structured as one
section per spec area. See `docs/adr/0009-bug-bounty-operating-system.md` for
the architectural decisions behind these choices, and
`docs/security/permission-matrix.md` for the full role/permission reference.

## Objective

Module 6 built the individual bug-bounty hunter's workflow (program tracking,
scope, findings, reports, AI drafting). Module 9 extends that into a team
platform: richer program/scope/finding data, a real collaboration layer
(roles, comments, mentions, assignments, tasks, activity feed), scheduled
automation, multi-channel notifications, filterable analytics, extended
search, a public REST API, and security hardening — without rewriting any
Module 1-8 code except where direct integration was required (see ADR 0009
§1-2 for the additive-only schema rule and the one documented pattern
deviation).

## Program Manager

`BugBountyProgram` gained multi-platform fields beyond Module 6's original
set: `safeHarbor`, `rateLimits`, `bountyTable`, `severityMatrix` (structured
JSON), `importFingerprint`/`lastImportedAt` (see Program Importer below), and
`favorite` (quick-access bookmarking independent of the generic Bookmarks
feature). `BugBountyProgramTarget` links a program to specific Targets from
Module 2's workspace layer. All CRUD stays on `BugBountyProgramsRepository`
(kept as a full repository interface — it's reused by the dashboard, search,
analytics, and the AI assistant).

## Program Importer

Extended with **update detection**: `computeImportFingerprint()` hashes a
canonicalized, order-insensitive JSON representation of a parsed import
(SHA-256, 64-hex-char digest) and stores it on the program after every
import/reimport. A later reimport recomputes the fingerprint and compares
strings in O(1) — no expensive diff runs unless the platform export actually
changed. When it has, `diffProgramImport()` produces a field-by-field,
human-readable diff (core fields plus a pattern-keyed scope-item add/remove
list, ignoring pure ordering/classification-only differences). Reimporting
never destructively removes or reclassifies existing scope items; removals
only ever surface in the diff for a human to act on. Covered by
`program-update-detector.spec.ts` (fingerprint stability/order-insensitivity,
diff correctness on renamed fields, added/removed scope items, tag changes).

## Scope Manager

`ScopeItemType` grew `HOST`, `INTERNAL_ASSET`, and `GITHUB_ORG` alongside
Module 6's original Domain/Wildcard/URL/API/Mobile/CIDR/IP-Range/ASN/Cloud-
Asset set. `ScopeClassification` grew `REVIEW_NEEDED` and `DEPRECATED`
lifecycle states on top of `IN_SCOPE`/`OUT_OF_SCOPE`/`UNKNOWN`, so a scope
item can now be flagged for human review or marked deprecated without being
deleted. Existing auto-classification logic (Module 6) is unchanged — new
enum values are additive, not a reclassification of existing behavior.

## Finding Manager

`BugBountyFindingStage` grew `DRAFT`, `INFORMATIVE`, `ACCEPTED`, `REJECTED`
alongside Module 6's lifecycle. The new **CVSS 3.1 calculator**
(`cvss/cvss-calculator.util.ts`) is a dependency-free, spec-accurate
implementation of FIRST.org's CVSS 3.1 base-score formula
(`calculateCvss`, `severityForCvssScore`, `cvssVectorString`,
`parseCvssVector`), exposed at `POST /bugbounty/cvss/calculate` for
score-as-you-type UI and reused inside the AI assistant's `calculateSeverity`
capability. Findings also gained **CWE/CAPEC/OWASP/MITRE ATT&CK mapping**
fields, letting a finding be tagged against standard vulnerability taxonomies
rather than free-text only.

## Report Builder

Report templates were extended with **custom template support** on top of
Module 6's five built-in renderers (HackerOne/Bugcrowd/Intigriti/Markdown/
HTML), and the AI Report Draft Assistant (Module 6) gained an **AI
grammar/technical review** capability (`review` in the AI assistant's finding
capability set) that critiques a draft for clarity, technical accuracy, and
missing sections rather than only generating one from scratch.

## Collaboration

New surface, entirely additive to the schema: `Comment` (threaded, on any
bug-bounty entity), `Mention` (parsed `@user` references inside comments),
`Assignment` (assign a finding/task to a workspace member), `TaskItem`
(lightweight checklist items scoped to a program/finding), `WorkspaceInvite`
(email-based invite flow), and an **activity feed**
(`activity-feed.controller.ts`) surfacing collaboration events alongside
Module 2's existing Activity Timeline.

Role-based access is a **single total order**,
`OWNER(6) > ADMIN(5) > MANAGER(4) > TRIAGER(3) > REVIEWER(2) > MEMBER(1)`
(`collaboration/permissions.util.ts`: `roleAtLeast()`, `requireRole()` — 403
`INSUFFICIENT_WORKSPACE_ROLE`, `requireCanGrantRole()` — a member can't
invite/promote above their own rank, and the last remaining OWNER can never
be demoted). Full action → minimum-role mapping is in
`docs/security/permission-matrix.md`. Covered by
`permissions.util.spec.ts` (rank ordering, `requireRole` pass/throw cases,
`requireCanGrantRole` self-rank ceiling, last-owner-demotion guard).

Collaboration/Automation/Notification-Channel/Public-API resources resolve
membership via the new explicit-workspaceId `resolveWorkspaceMembership()`
(`collaboration/workspace-membership.util.ts`) rather than Module 6's
implicit-personal-workspace `resolveWorkspaceForCaller()` — a real
multi-member team workspace needs an explicit role floor per action, which a
one-person personal workspace never did (see ADR 0009 §6).

## Bug Bounty Dashboard

Dashboard widgets gained collaboration-aware panels (assigned-to-me
findings/tasks, recent team activity) layered on top of Module 6's existing
program/finding/earnings widgets — read-time aggregation, no new storage.

## AI Bug Bounty Assistant

Nine capabilities live in one `BugBountyAiAssistantService`, reusing Module
5's `AiProviderRegistryService`/`collectStreamedCompletion` seam (no new AI
plumbing):

- Per-finding: `review`, `suggest-payloads`, `generate-poc`,
  `generate-repro-steps`, `generate-impact`, `generate-remediation`,
  `calculate-severity` (`bugbounty-findings.controller.ts`, seven
  `POST :id/ai/...` routes, each throttled 15/60s).
- Engagement-level: `suggest-attack-paths`, `summarize-engagement`
  (`bugbounty-ai-assistant.controller.ts`, `POST /bugbounty/ai/...`, same
  throttle).

Every capability **returns** a suggestion to the caller rather than
auto-writing it onto a live finding or report — "AI proposes, human
disposes." The one pre-existing exception is Module 6's
`GenerateBugReportDraftHandler`, which only fills an *unsubmitted* report
draft, a narrower blast radius than silently overwriting a finding someone is
actively working on. `calculateSeverity` asks the model only for CVSS
base-metric components (a constrained, checkable output) and scores them with
the deterministic calculator rather than trusting an opaque AI severity
label. All AI JSON output goes through a defensive `extractJson<T>()` parser
that strips markdown code fences and never throws on malformed output.

## Knowledge Base

`KnowledgeBaseNote` gained a `kind` classification
(`KnowledgeBaseEntryKind` — general notes alongside playbooks, CVE
references, tool notes, and AI conversation snapshots), `tags`, `cveId`, and
`sourceConversationId`. The new **`POST /bugbounty/knowledge-base/
save-conversation-snapshot`** route (`SaveConversationSnapshotCommand`)
builds a point-in-time Markdown transcript of an AI conversation (Module 5)
into a KB note — a copy, not a live link, so the note survives the source
conversation being edited or deleted. Reuses `resolveAiConversationForCaller`
(Module 5's `ai-authorization.util.ts`) for enumeration-safe authorization.

## Automation

`ScheduledJob` + `ScheduledJobRun` (`automation/controllers/
scheduled-jobs.controller.ts`) let a workspace schedule recurring bug-bounty
actions (e.g. periodic program reimport-and-diff, deadline sweeps) with a run
history. Simple CRUD over `PrismaService` directly (ADR 0009 §2 — no
cross-module reuse need for this entity).

## Notifications

Extended Module 6's in-app notifications with **multi-channel delivery**:
`NotificationChannelConfig` (per-workspace webhook/Slack-bot-token/custom-
endpoint configuration) and `NotificationDelivery` (per-channel delivery
record) via `notifications-channels/controllers/
notification-channels.controller.ts` and `NotificationDispatcherService`.
Channel secrets (`webhookUrl`, `botToken`, `endpoint`, and each `headers`
entry) are encrypted per-field at rest — see Security below.

## Analytics

`GET /bugbounty/analytics` (`bugbounty-analytics.controller.ts`,
`GetBugBountyAnalyticsHandler`) is a new, separately-filterable rollup
(`projectId`/`programId`/`from`/`to`) — intentionally kept apart from
Module 6's unfiltered `GET /bugbounty/statistics` rather than merging the
two handlers (ADR 0009 §8). Computes severity distribution,
acceptance/duplicate rate (same formula as Module 6's Statistics handler,
applied to the filtered report set), top 10 vuln types/targets, recon
coverage per program, average/median response time, and a daily activity
timeline. Like Module 6's Statistics, it works from in-memory lists capped
at ~1000 rows rather than a SQL aggregate — an accepted tradeoff at
personal/small-team-workspace scale, documented in both the query file and
ADR 0009.

## Search

`bugbounty-search.controller.ts` (Module 6) gained three new result types:
`AI_CHAT` (reuses `AiConversationsRepository.list({ search })` from Module
5 — no new plumbing), `TASK` (direct `PrismaService` query — `TaskItem` has
no repository interface anywhere in the codebase to reuse), and `TAG` (not a
real entity — a capped, unfiltered fetch of the `tags: string[]` column
across `BugBountyProgram`/`BugBountyFinding`/`PayloadLibraryEntry` (including
workspace-null seed rows)/`KnowledgeBaseNote`, with in-memory substring
matching and deduplication). Documented in the query file's class-level
comment and ADR 0009 §9.

## API

New public-facing REST surface under `public-api/controllers/`:
`api-keys.controller.ts` (create/list/revoke API keys) and
`webhook-tokens.controller.ts` (create/list/revoke webhook tokens, plus a
test-delivery endpoint that HMAC-signs a payload with the token's decrypted
secret). Both are Swagger-documented alongside the rest of the `apps/api`
surface and rate-limited the same way AI-backed routes are.

## Security

- **Encryption at rest (AES-256-GCM)**: `WebhookToken.secret` and
  `NotificationChannelConfig.config` (webhook URLs, bot tokens, custom-API
  endpoints/headers) now go through `common/utils/
  credential-encryption.util.ts` — the same service Phase 1 BYOK uses for
  `AiProviderCredential.encryptedApiKey`, keyed off
  `CREDENTIAL_ENCRYPTION_KEY`. Channel-config secrets are encrypted **per
  field**, not as one opaque blob, so the existing redaction mapper can still
  tell which keys to mask in API responses without decrypting first.
  Decryption falls back to the original value on malformed ciphertext rather
  than throwing (handles values written before this pass). Covered by
  `notification-channel-config-crypto.util.spec.ts`.
- **RBAC**: the Collaboration role hierarchy above, enforced on every
  Collaboration/Automation/Notification-Channel/Public-API route via
  `requireRole()`/`requireCanGrantRole()`.
- **Audit trail gap closed**: `WORKSPACE_MEMBER_INVITED`,
  `WORKSPACE_MEMBER_ROLE_CHANGED`, and `WORKSPACE_MEMBER_REMOVED` existed as
  `AuditEventType` enum values in the Prisma schema but were never written
  anywhere — found by grep during this module's security-hardening pass.
  Fixed: `collaboration/commands/workspace-invites.commands.ts` now writes
  an `auditEvent.create()` row (with workspaceId/target/role metadata) on
  invite, role change, and removal.
- **Import-path bug fixed**: `api-keys.commands.ts` and
  `webhook-tokens.commands.ts` both imported `AuditEventType` from
  `@pentesthub/shared`, which doesn't export it (it's a Prisma-generated
  enum) — would have been a genuine compile error. Fixed to import from
  `prisma-types.js`, matching every other correct usage in the codebase.
- **Session & Device History**: confirmed unchanged and still correct from
  Module 1 — no Module 9 code touches session/device management.
- Full detail: `docs/security/permission-matrix.md`.

## Offline Support (Desktop Agent)

The Module 9 spec requires: *"Desktop Agent continues working offline.
Synchronize automatically when online."* This section documents what that
means concretely for Module 9's new server-side domain, verified against the
actual Desktop Agent (Module 7) Sync Engine code rather than assumed.

### What already syncs

`apps/desktop/src-tauri/src/sync/mod.rs`'s `ENTITIES` registry is the single
source of truth for what the Sync Engine knows how to push/pull. Every entry
is fully generic — `engine.rs` builds its SQL from `EntityConfig` alone
(`SELECT * FROM {table}`), so registering a table is enough; no per-entity
Rust code is required.

| Entity | Local table | Tier |
|---|---|---|
| PROJECT | `projects` | Metadata |
| TARGET | `targets` | Metadata |
| NOTE | `notes` | Metadata |
| PAYLOAD | `payloads` | Metadata (push-only) |
| **FINDING** | `findings` | Metadata *(fixed this pass — see below)* |
| RECON_FINDING | `recon_results` | Everything-only |
| SCAN_FINDING | `scan_results` | Everything-only |
| EVIDENCE | `evidence` | Everything-only |
| REPORT | `reports` | Everything-only |
| AI_CONVERSATION | `ai_conversations` | Everything-only |

### Gap found and fixed: `findings` was never registered

Module 8 added a local `findings` table (`migrations/0003_findings.sql`) for
Burp Suite / Browser Extension-captured findings, with the exact column
shape (`remote_id`, `updated_at`, `deleted_at`, `sync_status`) every other
synced table has — but it was never added to `ENTITIES`. It quietly
participated in local-only storage and the generic `offline_queue` (which is
entity-agnostic by design) but never actually pushed or pulled. Fixed in
this pass: added `EntityConfig { entity_type: "FINDING", table: "findings",
tier: SyncTier::Metadata, ... pullable: true }` to the registry.

### The `/desktop-sync/*` backend surface is a documented, pre-existing gap

`sync/client.rs`'s own doc comment states the Desktop Agent's sync client
was built **against a contract, not a live backend** — `/desktop-sync/*` is
called out explicitly as "a Phase 2 backend addition per ADR 0007." Until
that backend surface exists, every push/pull call fails with a normal
`HTTP_ERROR`/connection-refused `AppError`, which `RetryQueue` already
treats as "retry later." This means the Desktop Agent today: works fully
offline (every local table is fully functional without a network
connection), queues every mutation for later sync via `offline_queue`
(generic, not entity-specific), and does not yet exchange data with a live
backend for **any** entity, Module 6/7/8's included — this was true before
Module 9 and remains true after it. Module 9 doesn't regress this; it
inherits the same documented state.

### What Module 9's new server-side entities do NOT have locally (disclosed, scoped out)

Module 9 introduces roughly a dozen new server-side tables: `BugBountyProgram`
+ `BugBountyProgramScopeItem` + `BugBountyProgramTarget`, `ScheduledJob` +
`ScheduledJobRun`, `Comment` + `Mention` + `Assignment` + `TaskItem`,
`NotificationChannelConfig` + `NotificationDelivery`, `ApiKey`,
`WebhookToken`, and extensions to `KnowledgeBaseNote` (kind/tags/cveId).
**None of these have a local SQLite mirror or an `ENTITIES` registry entry.**
This is a deliberate scope decision, not an oversight — the reasoning:

1. **They're inherently server/team concepts.** Scheduled Jobs run on the
   server (nothing to do offline). Comments/Mentions/Assignments coordinate
   a multi-member team — editing them offline on one laptop while teammates
   edit the same thread online has no sensible last-write-wins story without
   a much richer CRDT/OT layer than this Sync Engine implements (simple
   `updated_at` comparison, documented in `engine.rs`). Notification channel
   configs, API keys, and webhook tokens are account/credential objects that
   should never be minted or rotated while offline.
2. **The one genuinely offline-relevant piece — a hunter's own findings,
   notes, evidence, and recon results while working in the field with no
   connectivity — is exactly what's already registered** (TARGET, NOTE,
   FINDING, EVIDENCE, RECON_FINDING/SCAN_FINDING, REPORT). A hunter can
   capture a finding, write it up, and attach evidence fully offline today;
   they just can't manage program scope or team assignments offline, which
   is a reasonable product boundary.
3. **Building it out would be substantial, not incremental** — new SQLite
   migrations, new Rust repositories, new Tauri commands, and frontend
   wiring per entity, on top of the not-yet-built `/desktop-sync/*` backend
   itself. Doing this halfway (schema with no sync, or sync with no UI)
   would be worse than not doing it and saying so.

If offline access to Program/Scope/Collaboration data becomes a real
requirement, the path is: add the corresponding SQLite tables (same shape as
`findings`), register them in `ENTITIES`, and build the `/desktop-sync/*`
backend surface (Phase 2, already scoped in ADR 0007) — no Sync Engine
architecture changes needed, since it's already fully table-driven.

## Testing

New Jest spec files (real assertions, matching the project's existing
`@jest/globals`/typed `jest.fn<Type>()` style):

- `program-update-detector.spec.ts` — fingerprint determinism, order-
  insensitivity (scope items and tags), fingerprint changes on real content
  changes, diff correctness (changed fields, added/removed scope items keyed
  by pattern not full-row, classification-only changes not flagged, tag-order
  vs. real tag changes).
- `permissions.util.spec.ts` — role rank ordering, `requireRole()` pass/403
  cases, `requireCanGrantRole()`'s own-rank ceiling, last-owner-demotion
  guard.
- `notification-channel-config-crypto.util.spec.ts` — per-field encryption
  round-tripping for `webhookUrl`/`botToken`/`endpoint`/each `headers` entry,
  non-secret keys passed through untouched, empty-string fields left alone,
  graceful fallback on already-plaintext/malformed input, random-IV
  non-determinism across repeated encryptions.

These join Module 6's existing bug-bounty spec suite
(`bugbounty-finding-lifecycle.commands.spec.ts`,
`bug-report-lifecycle.commands.spec.ts`,
`bug-report-template-renderer.spec.ts`, `classify-scope-value.util.spec.ts`,
`duplicate-lexical-score.util.spec.ts`) without modifying any of them.

## Documentation

- `docs/adr/0009-bug-bounty-operating-system.md` — architecture decision
  record for this module.
- `docs/security/permission-matrix.md` — full role hierarchy, action→
  minimum-role table, audit trail, session/device history, and secrets-at-
  rest summary.
- This file — the per-spec-section implementation record.
- `PROJECT_SPEC.md` — Module 9 status blockquote added, cross-referencing
  the above.
- `README.md` — `## Modules` list backfilled with entries 7, 8, and 9 (it
  previously stopped at Module 6; Modules 7/8 — Desktop Agent and Browser
  Extension — hadn't been added yet either).
- `docs/releases/module-9-release-notes.md` — features/fixes/limitations/
  testing summary, matching the format of every prior module's release
  notes.

## Verification

Verification in this environment was constrained the same way it has been
since Module 6:

- `packages/shared`'s `tsc --noEmit` was re-run after every shared-type
  change made this module and stayed clean throughout — this remains the
  one reliable, fast, complete verification signal available in this
  sandbox.
- A full `apps/api` project-wide `tsc --noEmit` could not be run to
  completion in this sandbox (exceeds the per-command time budget, as in
  every prior module).
- Jest could not be executed in this sandbox for **any** spec file,
  including pre-existing, previously-passing ones (`cvss-calculator.util.
  spec.ts` from earlier this module) — reproduced with both `npx jest` and
  the local `jest` binary, with and without `NODE_OPTIONS=--experimental-vm-
  modules`, always failing with `Module ts-jest in the transform option was
  not found` despite `ts-jest` resolving correctly via plain
  `require.resolve()`. This was confirmed to be a pre-existing sandbox/
  tooling limitation, not a regression from this module's new spec files —
  all three new spec files were written and reviewed by hand against the
  exact function signatures read directly from source.
- No Rust/Cargo toolchain exists in this sandbox; the one Rust change
  (`sync/mod.rs`'s new `ENTITIES` entry) was reviewed by hand for structural
  correctness against every existing entry rather than compiled.
- All `apps/api` TypeScript changes were reviewed by hand against the exact
  repository-interface signatures, DTO shapes, and Prisma model fields they
  call, following the same discipline used for every prior module's
  sandbox-constrained verification pass.

**Before merging, run from the repo root:**
`pnpm build && pnpm lint && pnpm check-types && pnpm test`

## Commit

Per the Module 9 spec's closing instruction, commit only after build, lint,
typecheck, and tests all pass and documentation is up to date. Documentation
is complete as of this file. The build/lint/typecheck/test loop itself
requires an environment without this sandbox's `tsc`-timeout and Jest
`ts-jest`-resolution limitations (see Verification above) — the same
handoff point every module since Module 6 has reached. **Module 9 stops
here and waits for user approval before Module 10**, per the spec's explicit
closing instruction.
