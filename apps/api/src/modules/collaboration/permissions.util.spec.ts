import { describe, expect, it } from '@jest/globals';
import {
  requireCanGrantRole,
  requireRole,
  roleAtLeast,
} from './permissions.util.js';

describe('roleAtLeast', () => {
  it('returns true when the role outranks the minimum', () => {
    expect(roleAtLeast('OWNER', 'MEMBER')).toBe(true);
    expect(roleAtLeast('ADMIN', 'MANAGER')).toBe(true);
  });

  it('returns true when the role exactly matches the minimum', () => {
    expect(roleAtLeast('TRIAGER', 'TRIAGER')).toBe(true);
  });

  it('returns false when the role is below the minimum', () => {
    expect(roleAtLeast('MEMBER', 'REVIEWER')).toBe(false);
    expect(roleAtLeast('REVIEWER', 'MANAGER')).toBe(false);
  });

  it('orders the full Module 9 hierarchy correctly (OWNER > ADMIN > MANAGER > TRIAGER > REVIEWER > MEMBER)', () => {
    const order = ['OWNER', 'ADMIN', 'MANAGER', 'TRIAGER', 'REVIEWER', 'MEMBER'] as const;
    for (let i = 0; i < order.length; i++) {
      for (let j = 0; j < order.length; j++) {
        expect(roleAtLeast(order[i], order[j])).toBe(i <= j);
      }
    }
  });
});

describe('requireRole', () => {
  it('does not throw when the role meets the minimum', () => {
    expect(() => requireRole('MANAGER', 'TRIAGER')).not.toThrow();
    expect(() => requireRole('OWNER', 'OWNER')).not.toThrow();
  });

  it('throws INSUFFICIENT_WORKSPACE_ROLE (403) when the role is below the minimum', () => {
    expect(() => requireRole('MEMBER', 'MANAGER')).toThrow(
      expect.objectContaining({ code: 'INSUFFICIENT_WORKSPACE_ROLE' }),
    );
  });
});

describe('requireCanGrantRole', () => {
  it('allows granting a role at or below the acting member’s own rank', () => {
    expect(() => requireCanGrantRole('ADMIN', 'MANAGER')).not.toThrow();
    expect(() => requireCanGrantRole('ADMIN', 'ADMIN')).not.toThrow();
  });

  it('blocks granting a role above the acting member’s own rank', () => {
    expect(() => requireCanGrantRole('TRIAGER', 'ADMIN')).toThrow(
      expect.objectContaining({ code: 'INSUFFICIENT_WORKSPACE_ROLE' }),
    );
  });

  it('blocks a non-owner from ever granting OWNER', () => {
    expect(() => requireCanGrantRole('ADMIN', 'OWNER')).toThrow(
      expect.objectContaining({ code: 'INSUFFICIENT_WORKSPACE_ROLE' }),
    );
  });
});
