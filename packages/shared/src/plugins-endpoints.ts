export const PLUGIN_REGISTRY_ENDPOINTS = {
  list: "/plugins",
  publish: "/plugins",
  get: (id: string) => `/plugins/${id}`,
  update: (id: string) => `/plugins/${id}`,
  publishVersion: (id: string) => `/plugins/${id}/versions`,
  rate: (id: string) => `/plugins/${id}/ratings`,
  listRatings: (id: string) => `/plugins/${id}/ratings`,
} as const;

export const PLUGIN_INSTALLATION_ENDPOINTS = {
  list: (organizationId: string) => `/enterprise/organizations/${organizationId}/plugin-installations`,
  install: (organizationId: string) => `/enterprise/organizations/${organizationId}/plugin-installations`,
  update: (organizationId: string, id: string) =>
    `/enterprise/organizations/${organizationId}/plugin-installations/${id}`,
  uninstall: (organizationId: string, id: string) =>
    `/enterprise/organizations/${organizationId}/plugin-installations/${id}`,
  execute: (organizationId: string, id: string) =>
    `/enterprise/organizations/${organizationId}/plugin-installations/${id}/execute`,
} as const;
