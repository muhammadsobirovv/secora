/// Hosted free-tier AI policy (server-key usage).
///
/// Gemma 4 26B on the Gemini API free tier has a shared daily request pool
/// (14 400 RPD, 30 RPM, 16K TPM). We keep a safety margin below the pool
/// and split it across free users in 100-user groups:
///
///   per-user daily limit = min(MAX_PER_USER, floor(POOL / tierSize))
///   tierSize = ceil(activeFreeUsers / GROUP_SIZE) * GROUP_SIZE
///
/// Example: 1-300 users -> 40/day, 301-400 -> 30, 401-500 -> 24,
/// 801-900 -> 13, 901-1000 -> 12.

export const FREE_TIER_MODEL = 'gemma-4-26b-a4b-it';

/// Requests per day we allow the whole free pool (below Gemini's 14 400 RPD).
export const FREE_TIER_POOL_REQUESTS_PER_DAY = 12_000;

/// Upper bound per user, regardless of how few users exist.
export const FREE_TIER_MAX_PER_USER_PER_DAY = 40;

/// Limit is recalculated each time the active free-user count crosses a
/// multiple of this group size.
export const FREE_TIER_GROUP_SIZE = 100;

/// Free-tier prompts must stay under Gemma's 16K tokens-per-minute budget.
export const FREE_TIER_MAX_PROMPT_TOKENS = 12_000;

export function freeTierDailyLimitPerUser(activeFreeUsers: number): number {
  const groups = Math.max(1, Math.ceil(activeFreeUsers / FREE_TIER_GROUP_SIZE));
  const tierSize = groups * FREE_TIER_GROUP_SIZE;
  const share = Math.floor(FREE_TIER_POOL_REQUESTS_PER_DAY / tierSize);
  return Math.max(1, Math.min(FREE_TIER_MAX_PER_USER_PER_DAY, share));
}
