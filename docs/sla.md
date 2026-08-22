# SLA Tracking

Module 17. `SlaService` derives due dates and breach status for
`SlaEvent` rows tied to incidents (e.g. "acknowledge within 1 hour for
a critical incident", "contain within 4 hours"), rather than requiring
manual deadline entry — thresholds come from workspace-configurable
SLA policy, applied automatically when an incident's severity/status
changes.

## Breach detection

An `SlaEvent` is "breached" when `dueAt` has passed without the
corresponding lifecycle transition being recorded. `SocController`'s
dashboard (`docs/soc.md`) and any breach-listing call use
`SlaService.listEventsForWorkspace({ breachedOnly: true })`, backed by
the `SlaEvent.eventType, dueAt` composite index added in task #495 —
this is the exact predicate/sort shape ("which events of this type are
overdue, soonest first") that query needs.

## Endpoints (`SLA_ENDPOINTS`)

| Purpose | Route |
|---|---|
| List SLA events | `GET sla/events` |
| Get SLA event | `GET sla/events/:id` |
| Acknowledge/resolve | `PATCH sla/events/:id` |

## CLI / SDK

- CLI: `pentesthub sla events --breached-only`
- SDK: `client.sla.*` (TypeScript/Python/Go)
