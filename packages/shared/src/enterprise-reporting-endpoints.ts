export const ENTERPRISE_REPORT_ENDPOINTS = {
  list: (organizationId: string) => `/enterprise/organizations/${organizationId}/reports`,
  generate: (organizationId: string) => `/enterprise/organizations/${organizationId}/reports`,
  get: (organizationId: string, id: string) => `/enterprise/organizations/${organizationId}/reports/${id}`,
} as const;

export const REPORT_SCHEDULE_ENDPOINTS = {
  list: (organizationId: string) => `/enterprise/organizations/${organizationId}/report-schedules`,
  create: (organizationId: string) => `/enterprise/organizations/${organizationId}/report-schedules`,
  update: (organizationId: string, id: string) => `/enterprise/organizations/${organizationId}/report-schedules/${id}`,
  remove: (organizationId: string, id: string) => `/enterprise/organizations/${organizationId}/report-schedules/${id}`,
} as const;
