import { describe, expect, it } from '@jest/globals';
import {
  computeImportFingerprint,
  diffProgramImport,
} from './program-update-detector.js';
import type { ParsedProgramImport } from './program-importer.interface.js';
import type {
  BugBountyProgram,
  BugBountyProgramScopeItem,
} from '../../../prisma-types.js';

function baseParsed(overrides: Partial<ParsedProgramImport> = {}): ParsedProgramImport {
  return {
    name: 'Acme Corp',
    platform: 'HACKERONE',
    organization: 'Acme',
    url: 'https://hackerone.com/acme',
    rulesMarkdown: 'Be nice.',
    disclosurePolicy: 'Coordinated',
    tags: ['fintech'],
    scopeItems: [
      { type: 'DOMAIN', pattern: '*.acme.com', classification: 'IN_SCOPE' },
    ],
    warnings: [],
    ...overrides,
  };
}

function baseProgram(overrides: Partial<BugBountyProgram> = {}): BugBountyProgram {
  return {
    id: 'program-1',
    workspaceId: 'ws-1',
    projectId: null,
    name: 'Acme Corp',
    platform: 'HACKERONE',
    organization: 'Acme',
    url: 'https://hackerone.com/acme',
    status: 'ACTIVE',
    rulesMarkdown: 'Be nice.',
    bountyTable: null,
    severityMatrix: null,
    disclosurePolicy: 'Coordinated',
    notesMarkdown: null,
    tags: ['fintech'],
    favorite: false,
    safeHarbor: null,
    rateLimits: null,
    importFingerprint: null,
    lastImportedAt: null,
    createdBy: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  } as unknown as BugBountyProgram;
}

function scopeItem(
  overrides: Partial<BugBountyProgramScopeItem> = {},
): BugBountyProgramScopeItem {
  return {
    id: 'scope-1',
    programId: 'program-1',
    type: 'DOMAIN',
    pattern: '*.acme.com',
    classification: 'IN_SCOPE',
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as BugBountyProgramScopeItem;
}

describe('computeImportFingerprint', () => {
  it('produces the same fingerprint for the same parsed import', () => {
    const a = computeImportFingerprint(baseParsed());
    const b = computeImportFingerprint(baseParsed());
    expect(a).toBe(b);
  });

  it('is insensitive to scope item ordering', () => {
    const parsedA = baseParsed({
      scopeItems: [
        { type: 'DOMAIN', pattern: 'b.acme.com', classification: 'IN_SCOPE' },
        { type: 'DOMAIN', pattern: 'a.acme.com', classification: 'IN_SCOPE' },
      ],
    });
    const parsedB = baseParsed({
      scopeItems: [
        { type: 'DOMAIN', pattern: 'a.acme.com', classification: 'IN_SCOPE' },
        { type: 'DOMAIN', pattern: 'b.acme.com', classification: 'IN_SCOPE' },
      ],
    });
    expect(computeImportFingerprint(parsedA)).toBe(computeImportFingerprint(parsedB));
  });

  it('is insensitive to tag ordering', () => {
    const a = computeImportFingerprint(baseParsed({ tags: ['a', 'b'] }));
    const b = computeImportFingerprint(baseParsed({ tags: ['b', 'a'] }));
    expect(a).toBe(b);
  });

  it('changes when a scope item is added', () => {
    const before = computeImportFingerprint(baseParsed());
    const after = computeImportFingerprint(
      baseParsed({
        scopeItems: [
          { type: 'DOMAIN', pattern: '*.acme.com', classification: 'IN_SCOPE' },
          { type: 'DOMAIN', pattern: 'new.acme.com', classification: 'IN_SCOPE' },
        ],
      }),
    );
    expect(before).not.toBe(after);
  });

  it('changes when the rules markdown changes', () => {
    const before = computeImportFingerprint(baseParsed());
    const after = computeImportFingerprint(baseParsed({ rulesMarkdown: 'New rules.' }));
    expect(before).not.toBe(after);
  });

  it('is a 64-character hex sha256 digest', () => {
    const fingerprint = computeImportFingerprint(baseParsed());
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('diffProgramImport', () => {
  it('reports changed: false and an empty diff when nothing changed', () => {
    const result = diffProgramImport(baseProgram(), [scopeItem()], baseParsed());
    expect(result.changed).toBe(false);
    expect(result.diff).toEqual([]);
  });

  it('detects a changed field (name)', () => {
    const result = diffProgramImport(
      baseProgram(),
      [scopeItem()],
      baseParsed({ name: 'Acme Corp Renamed' }),
    );
    expect(result.changed).toBe(true);
    expect(result.diff).toContainEqual(
      expect.objectContaining({ field: 'name', previous: 'Acme Corp', next: 'Acme Corp Renamed' }),
    );
  });

  it('detects added scope items without flagging unrelated fields', () => {
    const result = diffProgramImport(
      baseProgram(),
      [scopeItem()],
      baseParsed({
        scopeItems: [
          { type: 'DOMAIN', pattern: '*.acme.com', classification: 'IN_SCOPE' },
          { type: 'DOMAIN', pattern: 'new.acme.com', classification: 'IN_SCOPE' },
        ],
      }),
    );
    expect(result.changed).toBe(true);
    const scopeDiff = result.diff.find((d) => d.field === 'scopeItems');
    expect(scopeDiff?.next).toEqual(['DOMAIN:new.acme.com']);
    expect(scopeDiff?.previous).toEqual([]);
  });

  it('detects removed scope items (present locally, absent from the fresh import)', () => {
    const result = diffProgramImport(
      baseProgram(),
      [scopeItem(), scopeItem({ id: 'scope-2', pattern: 'legacy.acme.com' })],
      baseParsed(),
    );
    const scopeDiff = result.diff.find((d) => d.field === 'scopeItems');
    expect(scopeDiff?.previous).toEqual(['DOMAIN:legacy.acme.com']);
    expect(scopeDiff?.next).toEqual([]);
  });

  it('does not flag scope items as changed when only the classification differs (pattern-keyed, not full-row)', () => {
    const result = diffProgramImport(
      baseProgram(),
      [scopeItem({ classification: 'REVIEW_NEEDED' })],
      baseParsed(),
    );
    const scopeDiff = result.diff.find((d) => d.field === 'scopeItems');
    expect(scopeDiff).toBeUndefined();
  });

  it('treats tag-order differences as no change', () => {
    const result = diffProgramImport(
      baseProgram({ tags: ['a', 'b'] }),
      [scopeItem()],
      baseParsed({ tags: ['b', 'a'] }),
    );
    expect(result.diff.find((d) => d.field === 'tags')).toBeUndefined();
  });

  it('detects a real tag change', () => {
    const result = diffProgramImport(
      baseProgram({ tags: ['a'] }),
      [scopeItem()],
      baseParsed({ tags: ['a', 'b'] }),
    );
    expect(result.diff.find((d) => d.field === 'tags')).toBeDefined();
  });
});
