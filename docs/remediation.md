# Remediation

Module 17. `RemediationTask` tracks fix work generated from findings,
incidents, or manual creation, through to verification.

## Workspace/project scoping

Mirrors `docs/incidents.md`'s scoping guarantee exactly:
`RemediationTask.workspaceId, projectId` and
`RemediationTask.workspaceId, createdAt` composite indexes (task #495)
back "this workspace's tasks for one project" and "this workspace's
most recent tasks" respectively. `workspaceId` is always
server-derived, never client-supplied, on every list/detail route.

## Automation rules

`AutomationRulesService` can auto-create or auto-update remediation
tasks in response to workspace events (new critical finding, SLA
breach, etc.) via the existing EventBus — it does not poll or run its
own scheduler; it reacts to events already published by other Module
17 services (`incidents`, `sla`, `threat-intel`). Covered by
`automation-rules.service.spec.ts` (task #496).

## Endpoints (`REMEDIATION_ENDPOINTS`)

| Purpose | Route |
|---|---|
| List tasks | `GET remediation/tasks` |
| Get task | `GET remediation/tasks/:id` |
| Create task | `POST remediation/tasks` |
| Update task | `PATCH remediation/tasks/:id` |
| Verify remediation | `POST remediation/tasks/:id/verify` |

## CLI / SDK

- CLI: `pentesthub remediation list`, `pentesthub remediation verify
  <id>`
- SDK: `client.remediation.*` (TypeScript/Python/Go)
