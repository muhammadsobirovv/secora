import type { FeatureFlagDto } from '@pentesthub/shared';
import type { FeatureFlag } from '../domain/repositories/feature-flags.repository.interface.js';

export function toFeatureFlagDto(flag: FeatureFlag): FeatureFlagDto {
  return {
    id: flag.id,
    key: flag.key,
    description: flag.description,
    defaultEnabled: flag.defaultEnabled,
    editionRules: flag.editionRules,
  };
}
