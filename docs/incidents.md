# Incident Response

Module 17. `IncidentsService` tracks the incident lifecycle
(`OPEN → INVESTIGATING → CONTAINMENT → ERADICATION → RECOVERY →
CLOSED`, with `REOPENED` as a re-entry state), linked playbook
executions (`incident-playbooks`), an AI-assisted investigation
workflow (`incident-investigation`), and SLA tracking (see
[`docs/sla.md`](./sla.md)).

## Workspace/project scoping

Every incident belongs to a `workspaceId` and, where applicable, a
`projectId`. The `Incident.workspaceId, projectId` and
`Incident.workspaceId, createdAt` composite indexes (task #495) back
the two dashboard/list query shapes actually used: "this workspace's
incidents for one project" and "this workspace's most recent
incidents." No incident list or detail endpoint accepts an unscoped
query — `workspaceId` is always required and always server-derived
from the authenticated caller, never taken from a client-supplied
field (the same IDOR class fixed in task #492 and, for a second
service, task #493).

## Playbook executions

`IncidentPlaybooksService.listForIncident` resolves each incident's
linked playbook-execution rows. As of task #494 this list is capped at
50 rows (`take: 50`) and resolves all links concurrently
(`Promise.all` instead of a sequential loop) rather than issuing N
sequential round-trips per incident.

## AI-assisted investigation

`IncidentInvestigationService.generatePlanViaAi` builds an
investigation plan from an analyst-supplied `goal` string. As of task
#493, that `goal` is wrapped with `fenceUntrusted()` and the system
prompt includes `UNTRUSTED_CONTENT_PROMPT_RULE` — an analyst's free-text
goal (or, if pasted from elsewhere, injected content within it) is
treated as data to summarize, never as an instruction the AI acts on.
The `CORRELATION_REVIEW` step's `correlationInsight` lookup is scoped
to both `projectId` AND `workspaceId` (task #493 fix — it was
previously missing the `workspaceId` filter, a cross-workspace IDOR
risk when `projectId`s aren't globally unique).

## AI SOC Analyst

`AiSocAnalystService` (see also `docs/soc.md`) uses the same
`fenceUntrusted`/`UNTRUSTED_CONTENT_PROMPT_RULE` pattern for every
piece of analyst- or tool-supplied free text it feeds into a prompt
(established task #492, centralized task #493).

## Endpoints (`INCIDENT_ENDPOINTS`)

| Purpose | Route |
|---|---|
| List incidents | `GET incidents` |
| Get incident | `GET incidents/:id` |
| Create incident | `POST incidents` |
| Update status | `PATCH incidents/:id/status` |
| List playbook executions | `GET incidents/:id/playbook-executions` |
| Start AI investigation | `POST incidents/:id/investigation` |

## CLI / SDK

- CLI: `pentesthub incidents list`, `pentesthub incidents status
  <id> <status>`
- SDK: `client.incidents.*` (TypeScript/Python/Go)
