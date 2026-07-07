import { randomBytes } from 'node:crypto';

/// Slugifies input and appends a short random suffix so callers don't need
/// a retry-on-collision loop against the unique constraint — good enough
/// for the personal-workspace-per-user case this is used for.
export function generateUniqueSlug(input: string): string {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
  const suffix = randomBytes(3).toString('hex');
  return `${base || 'workspace'}-${suffix}`;
}
