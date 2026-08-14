// Module 15 — Marketplace security. Extends Module 10/13's Plugin
// Marketplace (packages/shared/src/plugins.ts) rather than replacing it —
// `PluginDto.verified`/`downloadCount`/`ratingAverage`/`ratingCount` and
// `PluginRatingDto` already exist and are reused as-is.
// See docs/adr/0015-production-hardening-monetization-marketplace.md.

export type MarketplaceReviewStatus = "PENDING" | "APPROVED" | "REJECTED" | "FLAGGED";

export interface MarketplacePublisherDto {
  id: string;
  userId: string;
  organizationId: string | null;
  displayName: string;
  verified: boolean;
  verifiedAt: string | null;
  hasCustomSigningKey: boolean;
  websiteUrl: string | null;
  supportEmail: string | null;
}

export interface RegisterMarketplacePublisherRequestDto {
  displayName: string;
  organizationId?: string;
  websiteUrl?: string;
  supportEmail?: string;
  /// PEM-encoded Ed25519 public key. Optional — a publisher with no key
  /// registered still signs with (or is signed by) the marketplace
  /// operator's shared `PLUGIN_MARKETPLACE_PUBLIC_KEY`, same as today.
  publicKeyPem?: string;
}

/// One automated scan pass's result. `scanType` is a free-form string
/// (`"dependency"` | `"secret"` | `"malware-heuristic"` today —
/// deliberately not a closed union, so `MarketplaceScannerService` can add
/// scan types without a shared-package release) rather than a closed
/// union, matching the same "hook, not a hard dependency on any specific
/// paid scanning vendor" design as the platform's other supply-chain
/// scanning (Trivy/cargo-audit in CI — Module 14).
export interface MarketplaceScanResultDto {
  id: string;
  pluginVersionId: string;
  scanType: string;
  passed: boolean;
  findings: unknown;
  scannedAt: string;
}

export interface SecurityAdvisoryDto {
  id: string;
  pluginId: string | null;
  title: string;
  description: string;
  severity: "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  affectedVersionRange: string | null;
  patchedVersion: string | null;
  publishedAt: string;
}

export interface PublishSecurityAdvisoryRequestDto {
  pluginId?: string;
  title: string;
  description: string;
  severity: "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  affectedVersionRange?: string;
  patchedVersion?: string;
}

/// A `PluginVersion`'s checksum, exposed so a consumer can verify a
/// downloaded bundle independently of trusting this API's own install
/// flow — the same "don't just trust the pipe" principle Module 14's
/// cosign-signed container images serve for Docker distribution.
export interface PluginChecksumDto {
  pluginVersionId: string;
  checksumSha256: string | null;
  signaturePresent: boolean;
  reviewStatus: MarketplaceReviewStatus;
  scanResults: MarketplaceScanResultDto[];
}
