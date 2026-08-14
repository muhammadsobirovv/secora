export const FEATURE_FLAGS_ENDPOINTS = {
  list: () => "feature-flags",
  create: () => "feature-flags",
  flag: (id: string) => `feature-flags/${id}`,
  setOverride: () => "feature-flags/overrides",
  evaluate: () => "feature-flags/evaluate",
} as const;
