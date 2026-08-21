// Module 17 — endpoint path catalog, following the established
// `*_ENDPOINTS` convention (see module16-endpoints.ts). Only the
// surfaces the Exposure Management dashboard (task #476) and other
// frontend work actually need so far — extend as more Module 17 pages
// are built, never a parallel convention.

export const RISK_ENDPOINTS = {
  compute: () => "risk/compute",
  latestForFinding: (findingId: string) => `risk/findings/${findingId}`,
  historyForFinding: (findingId: string) => `risk/findings/${findingId}/history`,
  latestForAsset: (nodeType: string, refId: string) => `risk/assets/${nodeType}/${refId}`,
  historyForAsset: (nodeType: string, refId: string) => `risk/assets/${nodeType}/${refId}/history`,
} as const;

export const REMEDIATION_ENDPOINTS = {
  list: () => "remediation/tasks",
  create: () => "remediation/tasks",
  task: (id: string) => `remediation/tasks/${id}`,
  setStatus: (id: string) => `remediation/tasks/${id}/status`,
  evidence: (id: string) => `remediation/tasks/${id}/evidence`,
  findingVerification: (findingId: string) => `findings/${findingId}/verification`,
} as const;

export const SECURITY_METRICS_ENDPOINTS = {
  summary: () => "security-metrics/summary",
  trend: () => "security-metrics/trend",
} as const;

// Module 17 — task #467 (Indicator management frontend). Shares the
// `intel` route prefix `ThreatIntelController` already established
// (see that controller's own doc comment for why it isn't merged with
// `CveIntelligenceController`'s `cve`/`cve-matches` sub-paths).
export const THREAT_INTEL_ENDPOINTS = {
  indicators: () => "intel/indicators",
  indicator: (id: string) => `intel/indicators/${id}`,
  setIndicatorStatus: (id: string) => `intel/indicators/${id}/status`,
  actors: () => "intel/actors",
  campaigns: () => "intel/campaigns",
  reports: () => "intel/reports",
  techniques: () => "intel/techniques",
  relationships: (objectType: string, objectId: string) => `intel/relationships/${objectType}/${objectId}`,
  importLogs: () => "intel/import-logs",
  refresh: () => "intel/refresh",
  importStix: () => "intel/import/stix",
  taxiiPoll: () => "intel/taxii/poll",
} as const;

export const INCIDENT_ENDPOINTS = {
  list: () => "incidents",
  create: () => "incidents",
  incident: (id: string) => `incidents/${id}`,
  setStatus: (id: string) => `incidents/${id}/status`,
  assign: (id: string) => `incidents/${id}/assign`,
  timeline: (id: string) => `incidents/${id}/timeline`,
  addNote: (id: string) => `incidents/${id}/timeline/notes`,
  linkAsset: (id: string) => `incidents/${id}/links/assets`,
  linkFinding: (id: string) => `incidents/${id}/links/findings`,
  linkIndicator: (id: string) => `incidents/${id}/links/indicators`,
  linkEvidence: (id: string) => `incidents/${id}/links/evidence`,
  linkResearchSession: (id: string) => `incidents/${id}/links/research-sessions`,
  aiAnalysis: (id: string) => `incidents/${id}/ai-analysis`,
} as const;

// Module 17 — task #480 (SOC dashboard + Executive Security dashboard).
export const SLA_ENDPOINTS = {
  policies: () => "sla/policies",
  upsertPolicy: () => "sla/policies",
  events: () => "sla/events",
} as const;

// Module 17 — task #481 (Security Reporting extensions / Report Builder).
export const SECURITY_REPORT_ENDPOINTS = {
  list: () => "security-reports",
  generate: () => "security-reports",
  report: (id: string) => `security-reports/${id}`,
} as const;

// Module 17 — task #489 (REST API). Backs `SocController`'s single
// composed `/soc/dashboard` route — see that controller's own doc
// comment on why it exists as a thin aggregation over
// Incidents/SLA/Indicators/SecurityMetrics rather than a new data source.
export const SOC_ENDPOINTS = {
  dashboard: () => "soc/dashboard",
} as const;
