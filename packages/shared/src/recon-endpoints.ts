// Canonical HTTP routes for the Module 3 Recon Engine resources.
// Mirrors the convention established by workspace-foundation-endpoints.ts.

export const RECON_JOB_ENDPOINTS = {
  createForTarget: (targetId: string) => `/targets/${targetId}/recon/jobs`,
  listForTarget: (targetId: string) => `/targets/${targetId}/recon/jobs`,
  listForProject: (projectId: string) => `/projects/${projectId}/recon/jobs`,
  listRecent: "/recon/jobs/recent",
  get: (id: string) => `/recon/jobs/${id}`,
  cancel: (id: string) => `/recon/jobs/${id}/cancel`,
  retry: (id: string) => `/recon/jobs/${id}/retry`,
  logsStream: (id: string) => `/recon/jobs/${id}/logs/stream`,
  findings: (id: string) => `/recon/jobs/${id}/findings`,
} as const;

export const RECON_FINDING_ENDPOINTS = {
  listForTarget: (targetId: string) => `/targets/${targetId}/recon/findings`,
  get: (id: string) => `/recon/findings/${id}`,
  promote: (id: string) => `/recon/findings/${id}/promote`,
} as const;
