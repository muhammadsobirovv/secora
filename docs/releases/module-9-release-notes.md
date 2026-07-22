# Module 9 Release Notes — Bug Bounty Platform + Collaboration + Reporting Suite

Full decision record: `docs/adr/0009-bug-bounty-operating-system.md`.
Implementation record: `docs/modules/09-bug-bounty-operating-system.md`.
Permission reference: `docs/security/permission-matrix.md`.

## Features added

**Backend** — extends Module 6's bug-bounty workspace into a team platform,
additive to the existing schema throughout:

- **Program Manager**: `BugBountyProgram` gained `safeHarbor`, `rateLimits`,
  `bountyTable`/`severityMatrix` (structured JSON), `favorite`, and
  `BugBountyProgramTarget` linking to Module 2 Targets.
- **Program Importer**: update detection — `computeImportFingerprint()`
  (SHA-256, order-insensitive) for cheap reimport comparison, plus a
  separate `diffProgramImport()` for a human-readable field-by-field diff on
  demand. Reimports never destructively remove or reclassify existing scope
  items.
- **Scope Manager**: three new scope-item types (`HOST`, `INTERNAL_ASSET`,
  `GITHUB_ORG`) and two new classification states
  (`REVIEW_NEEDED`, `DEPRECATED`).
- **Finding Manager**: four new lifecycle stages (`DRAFT`, `INFORMATIVE`,
  `ACCEPTED`, `REJECTED`), a spec-accurate CVSS 3.1 calculator
  (`POST /bugbounty/cvss/calculate`), and CWE/CAPEC/OWASP/MITRE ATT&CK
  mapping fields.
- **Report Builder**: custom report templates and an AI grammar/technical
  review capability layered onto Module 6's five built-in renderers.
- **Collaboration** (new): `Comment`/`Mention`/`Assignment`/`TaskItem`/
  `WorkspaceInvite`, an activity feed, and a six-level role hierarchy
  (`OWNER > ADMIN > MANAGER > TRIAGER > REVIEWER > MEMBER`) enforced via
  `requireRole()`/`requireCanGrantRole()` on every collaboration route.
- **Bug Bounty Dashboard**: assigned-to-me findings/tasks and team-activity
  widgets, read-time aggregation.
- **AI Bug Bounty Assistant** (new): nine capabilities off one
  `BugBountyAiAssistantService` — `review`, `suggest-payloads`,
  `generate-poc`, `generate-repro-steps`, `generate-impact`,
  `generate-remediation`, `calculate-severity` (per-finding), plus
  `suggest-attack-paths` and `summarize-engagement` (engagement-level).
  Every capability returns a suggestion rather than auto-writing to a live
  finding or report.
- **Knowledge Base**: `kind` classification (general/playbook/CVE/tool/
  AI-conversation-snapshot), `tags`, `cveId`, and a new
  `save-conversation-snapshot` endpoint that captures an AI chat as a
  point-in-time Markdown KB note.
- **Automation** (new): `ScheduledJob` + `ScheduledJobRun` with run history.
- **Notifications**: multi-channel delivery (`NotificationChannelConfig` +
  `NotificationDelivery`) on top of Module 6's in-app notifications, with
  per-field encrypted secrets.
- **Analytics** (new): `GET /bugbounty/analytics`, filterable by
  project/program/date-range — severity distribution, acceptance/duplicate
  rate, top vuln types/targets, recon coverage, response time, activity
  timeline. Kept separate from Module 6's unfiltered `GET
  /bugbounty/statistics`.
- **Search**: three new result types — `AI_CHAT`, `TASK`, `TAG`.
- **Public REST API** (new): `ApiKey` and `WebhookToken` CRUD + revoke,
  webhook test-delivery with HMAC signing, under `public-api/`.
- **Security**: AES-256-GCM encryption at rest for `WebhookToken.secret` and
  `NotificationChannelConfig.config` (per-field, reusing Phase 1 BYOK's
  encryption service); the Collaboration role hierarchy; full workspace-
  membership/audit coverage on every new route.

**Frontend / offline**: the Desktop Agent's Sync Engine gained one fix
(`findings`, built in Module 8, was never registered in the `ENTITIES`
table — now is). Module 9's own new server-side entities (Program/Scope,
Scheduled Jobs, Collaboration, Notification Channels, API Keys/Webhooks)
are deliberately **not** mirrored locally — see the module doc's Offline
Support section for the full reasoning.

## Bugs found and fixed

1. **Wrong import path for `AuditEventType`**: `api-keys.commands.ts` and
   `webhook-tokens.commands.ts` both imported it from `@pentesthub/shared`,
   which doesn't export it (it's a Prisma-generated enum) — a genuine
   TypeScript compile error had it gone unnoticed. Fixed to import from
   `prisma-types.js`.
2. **`WebhookToken.secret` stored in plaintext despite a doc comment
   claiming AES-256-GCM encryption**: the comment was aspirational, not
   implemented. Fixed by actually calling `encryptCredential()`/
   `decryptCredential()` around the raw secret.
3. **Audit trail gap**: `WORKSPACE_MEMBER_INVITED`,
   `WORKSPACE_MEMBER_ROLE_CHANGED`, and `WORKSPACE_MEMBER_REMOVED` existed
   as `AuditEventType` enum values but were never written by any handler —
   found by grep. Fixed by adding `auditEvent.create()` calls to
   `workspace-invites.commands.ts`'s three handlers.
4. **Desktop Agent sync gap**: the `findings` local table (Module 8) had the
   correct sync-ready column shape but was never registered in the Sync
   Engine's `ENTITIES` array, so it silently never pushed or pulled. Fixed
   by adding the missing `EntityConfig` entry.

## Known limitations

- Analytics and Statistics both compute from in-memory lists capped at
  ~1000 rows rather than a SQL aggregate — the same accepted tradeoff
  Module 6 already made and documented, carried forward.
- Tag search does one unfiltered, capped fetch per tag-bearing table and
  matches substrings in memory rather than pushing the match into SQL.
- Collaboration/Automation/Notification-Channel/Public-API entities
  (~10 tables) use direct `PrismaService` injection in their command/query
  handlers rather than the full repository-interface pattern Modules 1-6
  use everywhere — a deliberate scope decision for simple, non-reused CRUD
  shapes, documented in ADR 0009 §2.
- None of Module 9's new server-side entities have an offline/local-first
  story on the Desktop Agent (see module doc's Offline Support section for
  the full reasoning and scope boundary).
- `/desktop-sync/*` remains unimplemented (a pre-existing, documented Phase
  2 item per ADR 0007) — unchanged by this module.

## Testing

Three new Jest spec files added, matching the project's established
`@jest/globals` / typed `jest.fn<Type>()` style: `program-update-detector.
spec.ts` (fingerprint determinism/order-insensitivity, diff correctness),
`permissions.util.spec.ts` (role ranking, `requireRole`/
`requireCanGrantRole` guards, last-owner-demotion), and
`notification-channel-config-crypto.util.spec.ts` (per-field encrypt/
decrypt round-tripping, non-secret passthrough, graceful fallback on
malformed input). None of Module 6's existing bug-bounty spec files were
modified.

Verification was constrained the same way it has been since Module 6:
`packages/shared`'s `tsc --noEmit` was re-run after every shared-type change
and stayed clean throughout. A full `apps/api` project-wide `tsc --noEmit`
and the Jest suite could not be run to completion in this sandbox — the
Jest failure (`Module ts-jest in the transform option was not found`) was
confirmed to reproduce on a pre-existing, previously-passing spec file too,
ruling out a regression from this module's changes; it's the same category
of environment limitation as the already-documented `tsc` timeout and the
absent Rust/Cargo toolchain. All changes were reviewed by hand against exact
source signatures. **Run `pnpm build && pnpm lint && pnpm check-types &&
pnpm test` from the repo root before merging.**
