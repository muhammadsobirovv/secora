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
