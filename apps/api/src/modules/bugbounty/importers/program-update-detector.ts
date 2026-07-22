import { createHash } from 'node:crypto';
import type { DetectProgramUpdateResultDto } from '@pentesthub/shared';
import type {
  BugBountyProgram,
  BugBountyProgramScopeItem,
} from '../../../prisma-types.js';
import type { ParsedProgramImport } from './program-importer.interface.js';

/// Module 9's "Program Importer... detect updates automatically" —
/// the fingerprint is a stable hash over the *normalized* import (post
/// `ProgramImporter.parse()`, so it's the same regardless of formatting
/// noise in the raw platform export), stored on `BugBountyProgram
/// .importFingerprint` after every successful import/reimport. A later
/// reimport recomputes the fingerprint from the freshly parsed payload
/// and compares — a plain string inequality check, not a deep diff,
/// which is why `diffProgramImport` (below) is the separate, human-
/// readable explanation of *what* changed, computed only when the
/// caller actually wants to see it (detect-update / reimport
/// responses), not on every fingerprint comparison.
function canonicalize(parsed: ParsedProgramImport): string {
  const scopeItems = [...parsed.scopeItems]
    .map((item) => ({
      type: item.type,
      pattern: item.pattern,
      classification: item.classification,
      notes: item.notes ?? null,
    }))
    .sort((a, b) =>
      a.type === b.type
        ? a.pattern.localeCompare(b.pattern)
        : a.type.localeCompare(b.type),
    );

  return JSON.stringify({
    name: parsed.name,
    platform: parsed.platform,
    organization: parsed.organization ?? null,
    url: parsed.url ?? null,
    rulesMarkdown: parsed.rulesMarkdown ?? null,
    disclosurePolicy: parsed.disclosurePolicy ?? null,
    tags: [...(parsed.tags ?? [])].sort(),
    scopeItems,
  });
}

export function computeImportFingerprint(parsed: ParsedProgramImport): string {
  return createHash('sha256').update(canonicalize(parsed)).digest('hex');
}

/// Field-by-field comparison of the currently stored program (plus its
/// scope items) against a freshly parsed import — used to render the
/// human-readable `diff` in DetectProgramUpdateResultDto /
/// ReimportProgramResultDto. Scope items are summarized as
/// added/removed pattern lists rather than a full before/after array,
/// since that's what a reviewer actually needs to decide whether to
/// apply the reimport.
export function diffProgramImport(
  existing: BugBountyProgram,
  existingScopeItems: BugBountyProgramScopeItem[],
  parsed: ParsedProgramImport,
): DetectProgramUpdateResultDto {
  const diff: DetectProgramUpdateResultDto['diff'] = [];

  const fieldPairs: [string, unknown, unknown][] = [
    ['name', existing.name, parsed.name],
    ['organization', existing.organization, parsed.organization ?? null],
    ['url', existing.url, parsed.url ?? null],
    ['rulesMarkdown', existing.rulesMarkdown, parsed.rulesMarkdown ?? null],
    [
      'disclosurePolicy',
      existing.disclosurePolicy,
      parsed.disclosurePolicy ?? null,
    ],
  ];
  for (const [field, previous, next] of fieldPairs) {
    if (previous !== next) diff.push({ field, previous, next });
  }

  const existingTags = [...existing.tags].sort();
  const nextTags = [...(parsed.tags ?? [])].sort();
  if (JSON.stringify(existingTags) !== JSON.stringify(nextTags)) {
    diff.push({ field: 'tags', previous: existing.tags, next: parsed.tags ?? [] });
  }

  const existingPatterns = new Set(
    existingScopeItems.map((item) => `${item.type}:${item.pattern}`),
  );
  const nextPatterns = new Set(
    parsed.scopeItems.map((item) => `${item.type}:${item.pattern}`),
  );
  const added = [...nextPatterns].filter((key) => !existingPatterns.has(key));
  const removed = [...existingPatterns].filter((key) => !nextPatterns.has(key));
  if (added.length > 0 || removed.length > 0) {
    diff.push({ field: 'scopeItems', previous: removed, next: added });
  }

  return { changed: diff.length > 0, diff };
}
