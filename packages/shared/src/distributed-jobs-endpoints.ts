export const WORKER_NODE_ENDPOINTS = {
  list: (organizationId: string) => `/enterprise/organizations/${organizationId}/distributed-jobs/workers`,
  register: (organizationId: string) => `/enterprise/organizations/${organizationId}/distributed-jobs/workers`,
  heartbeat: (organizationId: string, workerId: string) =>
    `/enterprise/organizations/${organizationId}/distributed-jobs/workers/${workerId}/heartbeat`,
  drain: (organizationId: string, workerId: string) =>
    `/enterprise/organizations/${organizationId}/distributed-jobs/workers/${workerId}/drain`,
  deregister: (organizationId: string, workerId: string) =>
    `/enterprise/organizations/${organizationId}/distributed-jobs/workers/${workerId}`,
} as const;

export const DISTRIBUTED_JOB_ENDPOINTS = {
  list: (organizationId: string) => `/enterprise/organizations/${organizationId}/distributed-jobs`,
  enqueue: (organizationId: string) => `/enterprise/organizations/${organizationId}/distributed-jobs`,
  get: (organizationId: string, id: string) => `/enterprise/organizations/${organizationId}/distributed-jobs/${id}`,
  cancel: (organizationId: string, id: string) =>
    `/enterprise/organizations/${organizationId}/distributed-jobs/${id}/cancel`,
  events: (organizationId: string, id: string) =>
    `/enterprise/organizations/${organizationId}/distributed-jobs/${id}/events`,
  metrics: (organizationId: string) => `/enterprise/organizations/${organizationId}/distributed-jobs/metrics`,
  // Worker-facing (X-API-Key auth, no organizationId in the path — a job's
  // tenant is resolved server-side from the claiming worker's own record).
  claim: (workerId: string) => `/distributed-jobs/workers/${workerId}/claim`,
  complete: (id: string) => `/distributed-jobs/${id}/complete`,
  fail: (id: string) => `/distributed-jobs/${id}/fail`,
} as const;
