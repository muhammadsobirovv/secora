// Canonical HTTP routes for the Module 4 Vulnerability Engine resources.
// Mirrors the convention established by recon-endpoints.ts.

export const VULN_SCAN_JOB_ENDPOINTS = {
  createForTarget: (targetId: string) => `/targets/${targetId}/vuln/jobs`,
  listForTarget: (targetId: string) => `/targets/${targetId}/vuln/jobs`,
  listForProject: (projectId: string) => `/projects/${projectId}/vuln/jobs`,
  listRecent: "/vuln/jobs/recent",
  get: (id: string) => `/vuln/jobs/${id}`,
  stop: (id: string) => `/vuln/jobs/${id}/stop`,
  pause: (id: string) => `/vuln/jobs/${id}/pause`,
  resume: (id: string) => `/vuln/jobs/${id}/resume`,
  retry: (id: string) => `/vuln/jobs/${id}/retry`,
  logsStream: (id: string) => `/vuln/jobs/${id}/logs/stream`,
  findings: (id: string) => `/vuln/jobs/${id}/findings`,
} as const;

export const VULN_FINDING_ENDPOINTS = {
  list: "/vuln/findings",
  listForTarget: (targetId: string) => `/targets/${targetId}/vuln/findings`,
  get: (id: string) => `/vuln/findings/${id}`,
  updateStatus: (id: string) => `/vuln/findings/${id}/status`,
  bulkUpdateStatus: "/vuln/findings/bulk-status",
} as const;

export const VULN_SCAN_TEMPLATE_ENDPOINTS = {
  list: "/vuln/templates",
  create: "/vuln/templates",
  get: (id: string) => `/vuln/templates/${id}`,
  delete: (id: string) => `/vuln/templates/${id}`,
} as const;

export const VULN_DASHBOARD_ENDPOINTS = {
  summary: "/vuln/dashboard",
  scannerHistory: "/vuln/scanners/history",
} as const;
