# 0009: Bug Bounty Operating System (Module 9)

## Context

Module 6 built the bug-bounty-hunter's individual workflow: track a program,
manage scope, promote a finding, write a report, get AI drafting help. Module
9's spec asks for the platform to become a full *operating system* around
that workflow — multi-platform program import with update detection, richer
scope/finding classification (CWE/CAPEC/OWASP/MITRE, a real CVSS 3.1
calculator), a team layer (roles, comments, mentions, assignments, task
lists, activity feed) that didn't exist before, scheduled automation,
multi-channel notifications, analytics, cross-entity search, a public REST
API with keys and webhooks, and security hardening (encryption, RBAC, audit/
session history). It's the largest single module by entity count so far —
roughly a dozen new tables — but architecturally it's almost entirely
*extension*, not *replacement*: every constraint from Modules 1-6 (workspace
isolation, enumeration-safe 404s, CQRS, soft deletes, additive-only schema
changes) carries forward unchanged.

## Decision

### 1. Additive-only schema evolution, enforced as a hard rule

Every Module 9 field is either a new column with a default (so existing rows
don't need a backfill) or a new table. Nothing existing was renamed, dropped,
or had its meaning changed — e.g. `BugBountyFindingStage` grew four new
values (`DRAFT`, `INFORMATIVE`, `ACCEPTED`, `REJECTED`) rather than replacing
the Module 6 stage list, and `ScopeItemType`/`ScopeClassification` grew new
variants (`HOST`, `INTERNAL_ASSET`, `GITHUB_ORG`, `THIRD_PARTY`,
`REVIEW_NEEDED`, `DEPRECATED`) the same way. This is the same discipline
every prior module's ADR states, restated here because Module 9 touches more
existing tables than any module since Module 6 itself.

### 2. Deliberate architectural deviation: direct `PrismaService` injection for ~10 simple new entities

Modules 1-6 use a strict repository-interface abstraction (domain interface
+ Prisma implementation + DI token) for every entity, including small ones.
Module 9's Collaboration surface (`Comment`, `Mention`, `Assignment`,
`TaskItem`, `WorkspaceInvite`), Automation (`ScheduledJob`,
`ScheduledJobRun`), Public API (`ApiKey`, `WebhookToken`), and Notification
Channels (`NotificationChannelConfig`, `NotificationDelivery`) instead inject
`PrismaService` directly into their command/query handlers. This is a
conscious trade-off, not an oversight: these entities have simple CRUD
shapes with no cross-module reuse need (nothing else in the codebase needs a
`CommentsRepository` interface the way `BugBountyFindingsRepository` is
reused across the dashboard, search, and AI assistant), and the interface
layer's main value — swappable persistence, easier mocking — wasn't worth
the ~40 extra files it would have produced for genuinely simple tables.
Everywhere a Module 9 entity *is* reused across multiple call sites
(`BugBountyProgramsRepository`, `BugBountyFindingsRepository`,
`KnowledgeBaseRepository`) it keeps the full repository-interface pattern.

### 3. Program Importer: fingerprint for cheap comparison, separate diff for the human-readable explanation

`computeImportFingerprint()` (SHA-256 over a canonicalized, sorted JSON
representation of the parsed import) is stored on `BugBountyProgram
.importFingerprint`/`lastImportedAt` after every import. A reimport
recomputes the fingerprint and compares strings — O(1), no diff computed
unless something actually changed. `diffProgramImport()` is a separate
field-by-field comparison, only run when the caller wants to see *what*
changed (`detect-update`/`reimport` responses). Reimporting **never removes
or reclassifies existing scope items** — it updates core program fields and
adds newly-discovered scope items; removals surface in the diff for a human
to act on through the normal scope endpoints. This mirrors Module 6's
"no destructive auto-classification" stance.

### 4. CVSS 3.1 calculator: pure function, reused by both a standalone endpoint and the AI assistant

`cvss-calculator.util.ts` (`calculateCvss`, `severityForCvssScore`,
`cvssVectorString`, `parseCvssVector`) is dependency-free and spec-accurate
to FIRST.org's CVSS 3.1 formula, exposed directly at
`POST /bugbounty/cvss/calculate` for score-as-you-type UI, and reused inside
the AI assistant's `calculateSeverity` capability: the AI is asked only for
CVSS base-metric *components* (a constrained, checkable output), which the
already-verified deterministic calculator then scores — combining AI
judgment with exact, auditable math rather than trusting an opaque LLM
severity label outright.

### 5. AI Bug Bounty Assistant: one service, thin command handlers, "AI proposes, human disposes"

All nine finding/engagement-level AI capabilities (review, suggest payloads,
generate PoC/repro-steps/impact/remediation, calculate severity, suggest
attack paths, summarize engagement) live in one `BugBountyAiAssistantService`
reusing Module 5's `AiProviderRegistryService`/`collectStreamedCompletion`
seam — no new AI plumbing. Every capability *returns* its suggestion to the
caller rather than auto-writing it onto a live finding or report (the one
pre-existing exception, `GenerateBugReportDraftHandler` from Module 6, is
narrower in scope: it fills in an *unsubmitted* report draft, a smaller
blast radius than silently overwriting a finding a hunter is actively
working). Defensive JSON parsing (`extractJson<T>()`, strips markdown code
fences, never throws) assumes the model won't always perfectly follow a
"JSON only" instruction.

### 6. Collaboration roles slot between Module 1's ADMIN and MEMBER, as a single rank

`OWNER(6) > ADMIN(5) > MANAGER(4) > TRIAGER(3) > REVIEWER(2) > MEMBER(1)` — a
total order, not a per-action ACL table (see
`docs/security/permission-matrix.md` for the full action→role mapping).
`requireCanGrantRole` additionally prevents a member from inviting or
promoting someone into a role above their own rank, and the last remaining
OWNER can never be demoted. Collaboration/Automation/Notification-channel/
Public-API resources resolve membership via the newer, explicit-workspaceId
`resolveWorkspaceMembership()` (a real multi-member team can share one
workspace); Module 6's original bug-bounty resources still resolve via the
implicit-personal-workspace `resolveWorkspaceForCaller()` — the two coexist
because a personal workspace has exactly one member, so no role floor beyond
"is a member" was needed there before Module 9 and still isn't.

### 7. Secrets at rest: AES-256-GCM, reusing Phase 1 BYOK's encryption service rather than a new one

`WebhookToken.secret` and `NotificationChannelConfig.config` (webhook URLs,
bot tokens, custom-API endpoints/headers) are encrypted with the same
`common/utils/credential-encryption.util.ts` used for
`AiProviderCredential.encryptedApiKey`, keyed off `CREDENTIAL_ENCRYPTION_KEY`.
Channel-config secrets are encrypted *per field* (not the whole JSON blob at
once) so the existing redaction mapper can still tell which keys to hide in
API responses without decrypting first. This closes a gap found during this
module's own security-hardening pass — a doc comment on `webhookToken.secret`
claimed AES-256-GCM encryption before the actual `encryptCredential()` call
was wired in; both are now consistent.

### 8. Analytics is a new, separately-filterable rollup — not a rewrite of Module 6's Statistics

`GET /bugbounty/statistics` (Module 6, unfiltered, workspace-wide) and
`GET /bugbounty/analytics` (Module 9, filterable by `projectId`/`programId`/
`from`/`to`, different shape — severity distribution, top vuln types/
targets, recon coverage, response time, activity timeline) intentionally
stay separate handlers rather than one handler serving two purposes. Both
compute from in-memory lists capped at ~1000 rows rather than a SQL
aggregate — acceptable at personal-workspace scale, the same tradeoff
Module 6's Statistics handler already made and documented.

### 9. Global Search gains AI_CHAT/TAG/TASK by reusing what exists, not inventing new indexes

`AI_CHAT` reuses `AiConversationsRepository.list({ search })` (Module 5) —
no new search plumbing. `TASK` and `TAG` go through `PrismaService` directly
(same reasoning as §2): `TaskItem` has no repository interface elsewhere to
reuse, and "tag" isn't an entity at all, just a `tags: string[]` column
shared across four tables — there's nothing to put an interface in front of.
Tag search does one unfiltered, capped fetch per tag-bearing table and
matches substrings in memory, since Postgres array-substring matching
through Prisma's query builder would need raw SQL for marginal benefit at
this data volume.

## Consequences

- Module 9 is the first module where a meaningful fraction of new code
  (Collaboration, Automation, Notification Channels, Public API) doesn't
  follow the repository-interface pattern. This is documented explicitly
  here and in-code so it reads as an intentional scope decision to future
  readers, not inconsistency.
- The Desktop Agent's local-first offline story does **not** extend to any
  of Module 9's new server-side entities (Program/Scope, Scheduled Jobs,
  Collaboration, Notification Channels, API Keys/Webhooks) — see
  `docs/modules/09-bug-bounty-operating-system.md`'s Offline Support section
  for the full reasoning. A hunter's own findings/notes/evidence/recon
  results (the genuinely field-relevant offline data) already sync via the
  existing `ENTITIES` registry, and gained one fix this module (`findings`
  was built in Module 8 but never actually registered).
- `/desktop-sync/*` — the backend surface the Desktop Agent's sync client is
  already built against — remains unimplemented (a documented Phase 2 item
  per ADR 0007), so no entity, Module 9's included, round-trips through a
  live backend today. This was true before this module and is unchanged by
  it.
- Verification in this environment was constrained the same way it has been
  since Module 6: a full `apps/api` `tsc --noEmit`/`jest` run could not be
  executed to completion in the sandbox this module was built in (see the
  module doc's "Verification performed" notes); `packages/shared`'s
  typecheck was re-run after every shared-type change and stayed clean
  throughout, and all `apps/api` changes were reviewed by hand against the
  exact repository-interface signatures they call.
