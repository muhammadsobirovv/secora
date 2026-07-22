/// Minimal, dependency-free 5-field cron ("minute hour day-of-month month
/// day-of-week") next-run-time calculator. Deliberately not a full cron
/// library (no `@`-shortcuts, no `L`/`W`/`#` special characters) — every
/// preset this module actually needs (`SCHEDULED_JOB_KIND_DEFAULT_CRON`
/// in @pentesthub/shared) and every schedule a user is realistically
/// going to type for "daily/weekly/monthly recon" fits `*`, a literal
/// number, a comma-separated list, or a `*/N` step in each field. Kept
/// intentionally small and testable rather than pulling in a dependency
/// for something with a well-known, bounded spec.

interface ParsedField {
  matches(value: number): boolean;
}

function parseField(raw: string, min: number, max: number): ParsedField {
  if (raw === '*') {
    return { matches: () => true };
  }
  if (raw.startsWith('*/')) {
    const step = Number(raw.slice(2));
    return { matches: (value) => (value - min) % step === 0 };
  }
  const allowed = new Set(raw.split(',').map(Number));
  for (const value of allowed) {
    if (Number.isNaN(value) || value < min || value > max) {
      throw new Error(`Invalid cron field value "${raw}" (expected ${min}-${max})`);
    }
  }
  return { matches: (value) => allowed.has(value) };
}

interface ParsedCron {
  minute: ParsedField;
  hour: ParsedField;
  dayOfMonth: ParsedField;
  month: ParsedField;
  dayOfWeek: ParsedField;
}

export function parseCronExpression(cronExpression: string): ParsedCron {
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Cron expression must have 5 fields, got ${parts.length}: "${cronExpression}"`);
  }
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  return {
    minute: parseField(minute, 0, 59),
    hour: parseField(hour, 0, 23),
    dayOfMonth: parseField(dayOfMonth, 1, 31),
    month: parseField(month, 1, 12),
    dayOfWeek: parseField(dayOfWeek, 0, 6),
  };
}

/// Finds the next UTC minute-boundary timestamp matching the expression,
/// strictly after `from`. Brute-force minute-by-minute search bounded to
/// 2 years out (far more than any realistic schedule needs) rather than a
/// closed-form solve — simple, obviously correct, and fast enough since
/// this only runs when a job is created/updated/completes, not in a hot
/// loop.
export function computeNextRunAt(cronExpression: string, from: Date = new Date()): Date {
  const parsed = parseCronExpression(cronExpression);
  const candidate = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), from.getUTCHours(), from.getUTCMinutes()));
  candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);

  const maxIterations = 60 * 24 * 366 * 2;
  for (let i = 0; i < maxIterations; i++) {
    if (
      parsed.minute.matches(candidate.getUTCMinutes()) &&
      parsed.hour.matches(candidate.getUTCHours()) &&
      parsed.dayOfMonth.matches(candidate.getUTCDate()) &&
      parsed.month.matches(candidate.getUTCMonth() + 1) &&
      parsed.dayOfWeek.matches(candidate.getUTCDay())
    ) {
      return candidate;
    }
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  }
  throw new Error(`Could not find a matching run time for cron expression "${cronExpression}" within 2 years`);
}
