-- Task #495 (M17 database review): additive index tuning for read
-- patterns confirmed against the actual service-layer queries during the
-- review pass. No column/table/enum changes, no data migration — every
-- statement here is either DROP INDEX (immediately followed by a wider
-- composite that fully subsumes it) or CREATE INDEX. Safe to apply to a
-- database that has already run
-- 20261201000000_soc_threat_intelligence_autonomous_research.

BEGIN;

-- ThreatIntelCatalogService.listActors / .listCampaigns both order by
-- `lastSeenAt DESC`. The existing `(workspaceId, name)` index on each
-- table exists for the import upsert's `findFirst({workspaceId, name})`
-- lookup and doesn't serve this read path.
CREATE INDEX "threat_actors_workspaceId_lastSeenAt_idx" ON "threat_actors"("workspaceId", "lastSeenAt");
CREATE INDEX "threat_campaigns_workspaceId_lastSeenAt_idx" ON "threat_campaigns"("workspaceId", "lastSeenAt");

-- ThreatMatchService.listMatchesForTarget: `WHERE targetId = $1 ORDER BY
-- confidence DESC`. Widens the existing single-column index to also
-- cover the sort column — the old index is a strict prefix of the new
-- one, so it's dropped rather than kept redundantly.
DROP INDEX "threat_matches_targetId_idx";
CREATE INDEX "threat_matches_targetId_confidence_idx" ON "threat_matches"("targetId", "confidence");

-- IncidentsService.listForWorkspace / RemediationService.listForWorkspace:
-- both filter by workspaceId + an optional projectId and always order by
-- `createdAt DESC`. Neither was covered by the pre-existing
-- status/severity/priority composite indexes on these tables.
CREATE INDEX "incidents_workspaceId_projectId_idx" ON "incidents"("workspaceId", "projectId");
CREATE INDEX "incidents_workspaceId_createdAt_idx" ON "incidents"("workspaceId", "createdAt");
CREATE INDEX "remediation_tasks_workspaceId_projectId_idx" ON "remediation_tasks"("workspaceId", "projectId");
CREATE INDEX "remediation_tasks_workspaceId_createdAt_idx" ON "remediation_tasks"("workspaceId", "createdAt");

-- SlaService.checkForBreaches (SlaBreachCheckerService's poll loop, so
-- this query runs on every tick, not just on a user request) does
-- `WHERE eventType = 'STARTED' AND dueAt < now() ORDER BY dueAt ASC` and
-- previously had no index covering either column.
CREATE INDEX "sla_events_eventType_dueAt_idx" ON "sla_events"("eventType", "dueAt");

COMMIT;
