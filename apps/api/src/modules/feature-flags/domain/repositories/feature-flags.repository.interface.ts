import type { FeatureFlagEditionRules, FeatureFlagScopeType } from '@pentesthub/shared';

/// Module 15 — Feature flags (task #357). Defined locally rather than
/// imported from `prisma-types.js` — same reason as `SupportTicket`
/// (task #355): `FeatureFlag`/`FeatureFlagOverride` were added to
/// `schema.prisma` in task #325 but `npx prisma generate` cannot run in
/// this sandbox (the `prisma` CLI package is absent from the local pnpm
/// store). Written to match `schema.prisma` field-for-field so the
/// Prisma-backed implementation below lines up with the real generated
/// client with no further changes once `prisma generate` runs on a
/// normal machine.
export interface FeatureFlag {
  id: string;
  key: string;
  description: string;
  defaultEnabled: boolean;
  editionRules: FeatureFlagEditionRules | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FeatureFlagOverride {
  id: string;
  featureFlagId: string;
  scopeType: FeatureFlagScopeType;
  scopeId: string;
  enabled: boolean;
  createdAt: Date;
}

export interface CreateFeatureFlagInput {
  key: string;
  description: string;
  defaultEnabled: boolean;
  editionRules: FeatureFlagEditionRules | null;
}

export interface SetFeatureFlagOverrideInput {
  featureFlagId: string;
  scopeType: FeatureFlagScopeType;
  scopeId: string;
  enabled: boolean;
}

export interface FeatureFlagsRepository {
  findAll(): Promise<FeatureFlag[]>;
  findById(id: string): Promise<FeatureFlag | null>;
  findByKey(key: string): Promise<FeatureFlag | null>;
  create(input: CreateFeatureFlagInput): Promise<FeatureFlag>;
  /// Every override whose `(scopeType, scopeId)` pair matches one of the
  /// caller's context identifiers (their own `userId`, and optionally a
  /// `workspaceId`/`organizationId` if the caller supplied one) — fetched
  /// in one query per `evaluateAll()` call rather than N.
  findOverridesForScopes(scopes: { scopeType: FeatureFlagScopeType; scopeId: string }[]): Promise<FeatureFlagOverride[]>;
  upsertOverride(input: SetFeatureFlagOverrideInput): Promise<FeatureFlagOverride>;
}

export const FEATURE_FLAGS_REPOSITORY = Symbol('FEATURE_FLAGS_REPOSITORY');
