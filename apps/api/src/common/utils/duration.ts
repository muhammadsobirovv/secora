/// Parses "15m" / "7d" / "1h" / "30s" style durations (as used throughout
/// env.validation.ts) into seconds. Kept intentionally simple — only the
/// suffixes actually used by JWT_*_TTL / ACCOUNT_LOCKOUT_MINUTES.
export function parseDurationToSeconds(duration: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(duration);
  if (!match) {
    throw new Error(
      `Invalid duration format: "${duration}" (expected e.g. "15m", "7d")`,
    );
  }
  const value = Number(match[1]);
  const unit = match[2] as 's' | 'm' | 'h' | 'd';
  const multipliers = { s: 1, m: 60, h: 3600, d: 86_400 } as const;
  return value * multipliers[unit];
}
