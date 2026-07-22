// Module 10 — Enterprise Analytics: a live, read-only dashboard view over
// the same underlying data `EnterpriseReport` snapshots (real-time
// aggregation, not a stored report) — distinct from Module 9's
// per-workspace `AnalyticsDashboardDto` (bugbounty.ts), this rolls up
// across every workspace in an organization and folds in Module 10
// platform metrics (distributed job queue health, plugin adoption).

export interface FindingsTrendPointDto {
  date: string;
  count: number;
}

export interface TopProgramDto {
  programId: string;
  name: string;
  findingCount: number;
}

export interface TopPluginDto {
  pluginId: string;
  name: string;
  installCount: number;
}

export interface EnterpriseAnalyticsDashboardDto {
  organizationId: string;
  workspaceCount: number;
  findingsTrend: FindingsTrendPointDto[];
  severityBreakdown: Record<"INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL", number>;
  topPrograms: TopProgramDto[];
  slaCompliance: { policiesEvaluated: number; withinTargetPct: number | null } | null;
  jobQueueHealth: {
    byStatus: Record<string, number>;
    onlineWorkers: number;
    totalCapacity: number;
    currentLoad: number;
    averageWaitMs: number | null;
  };
  topPlugins: TopPluginDto[];
  generatedAt: string;
}
