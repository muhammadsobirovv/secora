# Permission Matrix

Module 9 introduces workspace roles beyond Module 1's original OWNER/ADMIN/MEMBER
pair. This document is the authoritative reference for what each role can do —
enforced in code by `apps/api/src/modules/collaboration/permissions.util.ts`.

## Role hierarchy

Roles form a single total order (a simple rank, not a per-action ACL table) —
see `ROLE_RANK` in `permissions.util.ts`. A role can do everything a
lower-ranked role can do, plus whatever is gated at its own rank.

| Rank | Role | Origin |
|---|---|---|
| 6 | OWNER | Module 1 |
| 5 | ADMIN | Module 1 |
| 4 | MANAGER | Module 9 |
| 3 | TRIAGER | Module 9 |
| 2 | REVIEWER | Module 9 |
| 1 | MEMBER | Module 1 |

`requireRole(role, minimum)` throws `INSUFFICIENT_WORKSPACE_ROLE` (403) if the
caller's rank is below `minimum`. `requireCanGrantRole(actingRole, targetRole)`
additionally stops a member from inviting or promoting someone into a role
ranked above their own (a TRIAGER can never grant ADMIN, for instance).

## Action → minimum role

| Action | Minimum role | Enforced in |
|---|---|---|
| View programs, findings, reports, dashboard, analytics | MEMBER | All BugBounty read queries (workspace membership only, no role floor) |
| Create/update/comment/assign findings, reports, tasks | MEMBER | `bugbounty-finding-lifecycle.commands.ts`, `comments.commands.ts`, `assignments.commands.ts`, `task-items.commands.ts` |
| Review/triage a report, change finding severity | REVIEWER | Report/finding review-oriented endpoints (role floor documented per-handler) |
| Transition finding stage, submit/triage reports | TRIAGER | `bugbounty-finding-lifecycle.commands.ts` (`TransitionBugBountyFindingStageHandler`), `bug-report-lifecycle.commands.ts` |
| Create/update/delete a Scheduled Job, run it manually | MANAGER | `automation/commands/scheduled-jobs.commands.ts` |
| Create/update/delete a Webhook Token, test delivery | MANAGER | `public-api/commands/webhook-tokens.commands.ts` |
| Create a workspace API key | MANAGER | `public-api/commands/api-keys.commands.ts` (`CreateApiKeyHandler`) |
| Revoke a workspace API key | ADMIN | `public-api/commands/api-keys.commands.ts` (`RevokeApiKeyHandler`) |
| Invite a member, revoke an invite, list invites | ADMIN | `collaboration/commands/workspace-invites.commands.ts`, `collaboration/queries/workspace-invites.query.ts` |
| Change a member's role | ADMIN, and only to a role ≤ the actor's own | `UpdateWorkspaceMemberRoleHandler` (`requireRole` + `requireCanGrantRole`) |
| Remove a member | ADMIN | `RemoveWorkspaceMemberHandler` |
| Demote the workspace's only OWNER | Blocked outright (409 `WORKSPACE_MEMBER_ROLE_CANNOT_DEMOTE_LAST_OWNER`), regardless of role | `UpdateWorkspaceMemberRoleHandler` |

Personal-workspace-scoped resources (Programs, Findings, Reports, Knowledge
Base, Payload Library, Notifications, Bookmarks, Calendar — everything
resolved via `resolveWorkspaceForCaller` in `bugbounty/authorization.util.ts`)
have no per-action role floor beyond "is a member of this workspace" today,
since a personal workspace has exactly one member. The MANAGER/TRIAGER/
REVIEWER ranks exist for the explicit-multi-member-workspace surface
(Collaboration, Automation, Notification channels, Public API — everything
resolved via `resolveWorkspaceMembership` in
`collaboration/workspace-membership.util.ts`), which is where a real team
shares a workspace and role separation matters.

## Audit trail

Every role-gated mutation in the table above that changes workspace
membership or credentials also writes an `AuditEvent` row
(`AuditEventType`, Prisma-schema enum, see `schema.prisma`):

- `WORKSPACE_MEMBER_INVITED` / `WORKSPACE_MEMBER_ROLE_CHANGED` / `WORKSPACE_MEMBER_REMOVED` — `workspace-invites.commands.ts`
- `API_KEY_CREATED` / `API_KEY_REVOKED` — `public-api/commands/api-keys.commands.ts`
- `WEBHOOK_TOKEN_CREATED` / `WEBHOOK_TOKEN_REVOKED` — `public-api/commands/webhook-tokens.commands.ts`

These CQRS command handlers run outside an HTTP request context, so
`ipAddress`/`userAgent` on the audit row are recorded as placeholder values
(`"0.0.0.0"` / `"api"`) rather than the caller's real network origin — the
same limitation already accepted for the pre-existing `WEBHOOK_TOKEN_*`
events. Threading real request metadata into CQRS commands would require a
request-scoped context object across every controller → command boundary;
noted as a follow-up, not a blocker.

Module 1's original account-security events (`LOGIN_SUCCESS`,
`MFA_CHALLENGE_FAILURE`, `SESSION_REVOKED`, etc.) are unaffected — see
`docs/adr/0001-auth-module.md`.

## Session & Device History

Session/device history (list active sessions with device name, IP, browser,
OS, last-active time; revoke a session) is Module 1 functionality, unchanged
by Module 9 — see `Session`/`RefreshToken` in `schema.prisma` and
`apps/api/src/modules/auth/controllers/sessions.controller.ts`. Nothing in
Module 9 required extending it: workspace roles are orthogonal to device
sessions, which are per-user, not per-workspace.

## Secrets at rest

`WebhookToken.secret` and `NotificationChannelConfig.config` (webhook
URLs, bot tokens, custom-API endpoints/headers) are encrypted at rest with
AES-256-GCM via the same `common/utils/credential-encryption.util.ts`
service used for `AiProviderCredential.encryptedApiKey` (Phase 1 BYOK),
keyed off the `CREDENTIAL_ENCRYPTION_KEY` environment variable — see
`notification-channel-config-crypto.util.ts` for the per-field encrypt/
decrypt helpers and `webhook-tokens.commands.ts` for the webhook-secret
path. Neither is ever returned to a client in plaintext (webhook secrets
aren't returned at all past creation-time HMAC use; channel-config secret
fields are redacted to `"***"` in every DTO response — see
`to-channel-config-dto.mapper.ts`).
