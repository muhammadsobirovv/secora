import { describe, expect, it } from '@jest/globals';
import {
  classifyScopeValue,
  type ScopeRule,
} from './classify-scope-value.util.js';

function rule(overrides: Partial<ScopeRule>): ScopeRule {
  return {
    id: 'rule-1',
    type: 'DOMAIN',
    pattern: 'example.com',
    classification: 'IN_SCOPE',
    ...overrides,
  };
}

describe('classifyScopeValue', () => {
  it('matches an exact DOMAIN rule case-insensitively', () => {
    const result = classifyScopeValue('Example.com', [
      rule({
        id: 'r1',
        type: 'DOMAIN',
        pattern: 'example.com',
        classification: 'IN_SCOPE',
      }),
    ]);
    expect(result).toEqual({
      classification: 'IN_SCOPE',
      matchedScopeItemId: 'r1',
      matchedPattern: 'example.com',
    });
  });

  it('matches a WILDCARD rule against the base domain and subdomains, not a lookalike domain', () => {
    const rules = [
      rule({
        id: 'r1',
        type: 'WILDCARD',
        pattern: '*.example.com',
        classification: 'IN_SCOPE',
      }),
    ];
    expect(classifyScopeValue('example.com', rules).classification).toBe(
      'IN_SCOPE',
    );
    expect(classifyScopeValue('app.example.com', rules).classification).toBe(
      'IN_SCOPE',
    );
    expect(
      classifyScopeValue('deep.app.example.com', rules).classification,
    ).toBe('IN_SCOPE');
    expect(classifyScopeValue('notexample.com', rules).classification).toBe(
      'UNKNOWN',
    );
  });

  it('matches a CIDR rule for an IPv4 address inside the block', () => {
    const rules = [
      rule({
        id: 'r1',
        type: 'CIDR',
        pattern: '10.0.0.0/24',
        classification: 'IN_SCOPE',
      }),
    ];
    expect(classifyScopeValue('10.0.0.5', rules).classification).toBe(
      'IN_SCOPE',
    );
    expect(classifyScopeValue('10.0.1.5', rules).classification).toBe(
      'UNKNOWN',
    );
  });

  it('matches an IP_RANGE rule inclusively at both ends', () => {
    const rules = [
      rule({
        id: 'r1',
        type: 'IP_RANGE',
        pattern: '10.0.0.10-10.0.0.20',
        classification: 'IN_SCOPE',
      }),
    ];
    expect(classifyScopeValue('10.0.0.10', rules).classification).toBe(
      'IN_SCOPE',
    );
    expect(classifyScopeValue('10.0.0.20', rules).classification).toBe(
      'IN_SCOPE',
    );
    expect(classifyScopeValue('10.0.0.21', rules).classification).toBe(
      'UNKNOWN',
    );
  });

  it('gives OUT_OF_SCOPE priority over a broader IN_SCOPE wildcard, regardless of rule order', () => {
    const rules = [
      rule({
        id: 'in',
        type: 'WILDCARD',
        pattern: '*.example.com',
        classification: 'IN_SCOPE',
      }),
      rule({
        id: 'out',
        type: 'DOMAIN',
        pattern: 'internal.example.com',
        classification: 'OUT_OF_SCOPE',
      }),
    ];
    const result = classifyScopeValue('internal.example.com', rules);
    expect(result.classification).toBe('OUT_OF_SCOPE');
    expect(result.matchedScopeItemId).toBe('out');
  });

  it('returns UNKNOWN with no matched pattern when nothing matches', () => {
    const result = classifyScopeValue('unrelated.org', [
      rule({
        id: 'r1',
        type: 'DOMAIN',
        pattern: 'example.com',
        classification: 'IN_SCOPE',
      }),
    ]);
    expect(result).toEqual({
      classification: 'UNKNOWN',
      matchedScopeItemId: null,
      matchedPattern: null,
    });
  });

  it('treats an invalid CIDR prefix as a non-match rather than throwing', () => {
    const rules = [
      rule({
        id: 'r1',
        type: 'CIDR',
        pattern: '10.0.0.0/99',
        classification: 'IN_SCOPE',
      }),
    ];
    expect(() => classifyScopeValue('10.0.0.5', rules)).not.toThrow();
    expect(classifyScopeValue('10.0.0.5', rules).classification).toBe(
      'UNKNOWN',
    );
  });
});
