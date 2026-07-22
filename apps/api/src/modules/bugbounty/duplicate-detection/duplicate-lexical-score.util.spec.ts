import { describe, expect, it } from '@jest/globals';
import { scoreLexicalMatch } from './duplicate-lexical-score.util.js';
import type { DuplicateCandidateProjection } from '../domain/repositories/bugbounty-findings.repository.interface.js';

function candidate(
  overrides: Partial<DuplicateCandidateProjection>,
): DuplicateCandidateProjection {
  return {
    id: 'finding-1',
    title: 'Reflected XSS in search box',
    targetId: 'target-1',
    endpoint: '/search',
    payload: '<script>alert(1)</script>',
    vulnType: 'XSS',
    stage: 'NEW',
    ...overrides,
  };
}

describe('scoreLexicalMatch', () => {
  it('scores near-identical titles highly via token overlap even with different wording', () => {
    const { score, matchedOn } = scoreLexicalMatch(
      { title: 'Reflected XSS on search parameter' },
      candidate({
        title: 'Reflected XSS in search box',
        targetId: null,
        endpoint: null,
        payload: null,
        vulnType: null,
      }),
    );
    expect(matchedOn).toContain('title');
    expect(score).toBeGreaterThan(0);
  });

  it('adds target/endpoint/payload/vulnType weights on top of title score', () => {
    const { score, matchedOn } = scoreLexicalMatch(
      {
        title: 'Reflected XSS in search box',
        targetId: 'target-1',
        endpoint: '/search',
        payload: '<script>alert(1)</script>',
        vulnType: 'XSS',
      },
      candidate({}),
    );
    expect(matchedOn).toEqual(
      expect.arrayContaining([
        'title',
        'target',
        'endpoint',
        'payload',
        'vulnType',
      ]),
    );
    // Exact match on everything should score at or near the 1.0 cap.
    expect(score).toBeCloseTo(1, 5);
  });

  it('caps the combined score at 1 even when every signal matches', () => {
    const { score } = scoreLexicalMatch(
      {
        title: 'Reflected XSS in search box',
        targetId: 'target-1',
        endpoint: '/search',
        payload: '<script>alert(1)</script>',
        vulnType: 'XSS',
      },
      candidate({}),
    );
    expect(score).toBeLessThanOrEqual(1);
  });

  it('returns a zero score with no matches for unrelated findings', () => {
    const { score, matchedOn } = scoreLexicalMatch(
      { title: 'SQL injection in login form' },
      candidate({
        title: 'Open redirect on logout',
        targetId: 'other-target',
        endpoint: '/logout',
        payload: null,
        vulnType: 'OPEN_REDIRECT',
      }),
    );
    expect(matchedOn).toEqual([]);
    expect(score).toBe(0);
  });

  it('does not credit a title match below the 0.3 similarity threshold', () => {
    const { matchedOn } = scoreLexicalMatch(
      { title: 'IDOR on user profile endpoint' },
      candidate({
        title: 'CSRF in password reset flow',
        targetId: null,
        endpoint: null,
        payload: null,
        vulnType: null,
      }),
    );
    expect(matchedOn).not.toContain('title');
  });
});
