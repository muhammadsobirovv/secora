export const PLUGIN_PERMISSIONS_ENDPOINTS = {
  status: (pluginInstallationId: string) => `plugin-installations/${pluginInstallationId}/permissions`,
  grant: () => "plugin-installations/permissions/grant",
  revoke: (pluginInstallationId: string, permission: string) =>
    `plugin-installations/${pluginInstallationId}/permissions/${permission}`,
} as const;
