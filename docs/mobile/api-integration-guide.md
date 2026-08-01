# Mobile API Integration Guide

How `apps/mobile` talks to `apps/api`, and where each backend module's
contract lives in `packages/shared`. Read this before adding a new
repository method — the routes/DTOs already exist in TypeScript; never
hand-invent a path or field name.

## The envelope

Every response is `packages/shared/src/api-response.ts`'s
`ApiSuccessResponse<T>` (`{success:true,data:T}`) or `ApiErrorResponse`
(`{statusCode,code,message}`). `core/network/api_client.dart`'s `_request`
method is the **only** place that unwraps this — every repository method
passes a `decode: (json) => ...` callback and gets back the unwrapped,
typed `data`. Never call `Dio` directly from a repository for anything
that returns this envelope (raw `Dio` access via `ApiClient.raw` exists
only for the one case that doesn't — multipart file upload, see Evidence
below).

## Auth & the bearer token

`_AuthInterceptor` (inside `api_client.dart`) attaches
`Authorization: Bearer <accessToken>` to every request whose
`RequestOptions.extra['public']` isn't `true`, and coalesces concurrent
401s into one `/auth/refresh` call — mirrors `apps/web/lib/api/client.ts`'s
`refreshPromise` pattern exactly. Pass `public: true` (as an
`Options(extra: {'public': true})` or via `ApiClient`'s own `public`
parameter) for the auth endpoints that must work with no token yet
(login, register, refresh itself, password reset, OAuth exchange).

## Where each module's contract lives

| Backend module | Shared endpoint file | Shared DTO file | Mobile repository |
|---|---|---|---|
| Auth (1) | `auth-endpoints.ts` | `auth.ts` | `features/auth/data/auth_repository.dart` |
| Workspace Foundation (2) | `workspace-foundation-endpoints.ts` | `workspace.ts`/`projects.ts`/`targets.ts`/`notes.ts`/`evidence.ts` | `features/projects`, `features/targets`, `features/evidence`, `features/workspace` |
| AI Security Copilot (5) | `ai-endpoints.ts` | `ai.ts` | `features/ai_chat/data/ai_chat_repository.dart` |
| Bug Bounty Workspace (6) | `bugbounty-endpoints.ts` | `bugbounty.ts` | `features/findings`, `features/reports`, `features/notifications` |
| AI Multi-Agent System (11) | `agent-endpoints.ts`, `knowledge-base-reference-endpoints.ts` | `agent.ts`, `knowledge-base-reference.ts` | `features/agent/data/agent_repository.dart`, `knowledge_base_repository.dart` |
| Privacy Mode (11) | `ai-endpoints.ts` (`AI_PRIVACY_ENDPOINTS`) | — | `features/settings/data/privacy_mode_repository.dart` |
| Global search | `workspace-foundation-endpoints.ts` (`SEARCH_ENDPOINTS`) | `search.ts` | `features/search/data/global_search_repository.dart` |

`apps/mobile` does not depend on `@pentesthub/shared` as an npm/pub
package (Dart can't import a TypeScript package) — every DTO shape is
hand-mirrored into a plain Dart class under each feature's `domain/`
folder, with a doc comment naming the exact `.ts` source it mirrors. **If
a shared DTO changes, the mirrored Dart class must be updated by hand** —
there is no codegen step keeping these in sync (unlike `apps/web`, which
imports the real TypeScript types directly). Search this guide's table
plus `grep`-ing for the DTO name in `apps/mobile/lib` before assuming a
field doesn't exist.

## Streaming (SSE)

Two endpoints stream: `AI_CONVERSATION_ENDPOINTS.streamMessage` (chat) and
`AGENT_ORCHESTRATION_ENDPOINTS.stream` (orchestration runs). Both go
through `core/network/sse_client.dart`'s `SseClient.connect(path, method,
body)`, which returns a `Stream<String>` of raw JSON payloads (one `data:`
line per SSE event) — callers `jsonDecode` and match their own event union
(`ChatStreamEvent`/`OrchestrationEvent` in the respective feature's
`domain/` folder). This exists because Flutter has no built-in
`EventSource`, and even a plugin providing one couldn't attach the bearer
header these endpoints require — see `SseClient`'s doc comment and
`apps/web`'s own `useReconJobLogs`/`useAgentRunStream` hooks, which face
and solve the identical problem with a manual `fetch()` +
`ReadableStream` reader.

## File upload (multipart)

Evidence attachment upload (`EVIDENCE_ENDPOINTS.attachments(id)`) is the
one place a repository reaches past `ApiClient`'s envelope-decoding
methods to `ApiClient.raw` (the underlying `Dio` instance) directly,
building a `dio.FormData` with `MultipartFile.fromFile(...)` — see
`features/evidence/data/evidence_repository.dart`'s `_uploadOne`. Every
other file-shaped operation (report export/download) returns the file
content as a JSON string field (`ExportBugReportResultDto.content`), not
a binary stream, and goes through the normal envelope path.

## Adding a new backend call

1. Find the real route in the matching `*-endpoints.ts` file — never
   guess a path.
2. Find the real request/response shape in the matching `.ts` DTO file.
3. Mirror only the fields the mobile UI actually needs into a Dart class
   under `domain/` (trimming is fine and already done throughout this
   module — e.g. `Finding` doesn't mirror every field
   `BugBountyFindingDto` has); note in a doc comment which fields were
   dropped if it's not obvious why.
4. Add the method to the feature's repository, using
   `ApiClient.get/post/patch/delete` with an explicit `decode` callback.
