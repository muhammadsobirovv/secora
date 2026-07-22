export const ENTERPRISE_ANALYTICS_ENDPOINTS = {
  dashboard: (organizationId: string) => `/enterprise/organizations/${organizationId}/analytics/dashboard`,
} as const;
