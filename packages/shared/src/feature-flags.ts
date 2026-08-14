// Module 15 — Feature flags (task #357).
// See docs/adr/0015-production-hardening-monetization-marketplace.md.

export type FeatureFlagScopeType = "ORGANIZATION" | "WORKSPACE" | "USER";

/// `editionRules` conditions `FeatureFlagService.isEnabled()` evaluates
/// before falling back to `defaultEnabled`. All fields optional and
/// AND-ed together when present.
export interface FeatureFlagEditionRules {
  minEdition?: "community" | "enterprise";
  planTiers?: string[];
  /// `true` restricts to self-hosted-only deployments (no `License` row
  /// at all); `false` restricts to hosted/hosted-with-license
  /// deployments; omitted means "no restriction."
  selfHostedOnly?: boolean;
  betaOnly?: boolean;
  developerOnly?: boolean;
}

export interface FeatureFlagDto {
  id: string;
  key: string;
  description: string;
  defaultEnabled: boolean;
  editionRules: FeatureFlagEditionRules | null;
}

export interface CreateFeatureFlagRequestDto {
  key: string;
  description: string;
  defaultEnabled?: boolean;
  editionRules?: FeatureFlagEditionRules;
}

export interface SetFeatureFlagOverrideRequestDto {
  featureFlagId: string;
  scopeType: FeatureFlagScopeType;
  scopeId: string;
  enabled: boolean;
}

/// `GET feature-flags/evaluate` response — every flag's resolved value
/// for the calling context (current user + their active
/// workspace/organization), so a frontend can fetch once at app boot
/// rather than one call per flag.
export interface EvaluatedFeatureFlagsDto {
  flags: Record<string, boolean>;
}
