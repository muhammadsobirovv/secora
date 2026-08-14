export const MARKETPLACE_SECURITY_ENDPOINTS = {
  registerPublisher: () => "marketplace/publishers",
  myPublisherProfile: () => "marketplace/publishers/me",
  /// Platform-operator only (`@Roles('ADMIN')`) — see
  /// `MarketplacePublisherService.verify()`'s doc comment for why
  /// verification is never self-service.
  verifyPublisher: (publisherId: string) => `marketplace/publishers/${publisherId}/verify`,
  pluginChecksum: (pluginVersionId: string) => `marketplace/plugin-versions/${pluginVersionId}/checksum`,
  advisories: () => "marketplace/advisories",
  advisory: (id: string) => `marketplace/advisories/${id}`,
  pluginAdvisories: (pluginId: string) => `marketplace/plugins/${pluginId}/advisories`,
} as const;
