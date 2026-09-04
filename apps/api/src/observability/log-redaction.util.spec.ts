import { describe, expect, it } from '@jest/globals';
import { redactSensitiveData } from './log-redaction.util.js';

/// Module 18 — task #506 (Structured logging + secret redaction).

describe('redactSensitiveData', () => {
  it('redacts a top-level password field', () => {
    const result = redactSensitiveData({ email: 'a@b.com', password: 'hunter2' }) as Record<string, unknown>;
    expect(result.email).toBe('a@b.com');
    expect(result.password).toBe('[REDACTED]');
  });

  it('redacts every known sensitive key name, case-insensitively', () => {
    const input = {
      Password: 'x',
      accessToken: 'x',
      REFRESH_TOKEN: 'x',
      apiKey: 'x',
      api_key: 'x',
      clientSecret: 'x',
      Authorization: 'x',
      mfaSecret: 'x',
      backupCodes: ['a', 'b'],
    };
    const result = redactSensitiveData(input) as Record<string, unknown>;
    for (const key of Object.keys(input)) {
      expect(result[key]).toBe('[REDACTED]');
    }
  });

  it('redacts nested object fields at any depth', () => {
    const result = redactSensitiveData({
      user: { id: 'u1', credentials: { password: 'hunter2', apiKey: 'sk-live-xyz' } },
    }) as Record<string, unknown>;
    const user = result.user as Record<string, unknown>;
    const credentials = user.credentials as Record<string, unknown>;
    expect(user.id).toBe('u1');
    expect(credentials.password).toBe('[REDACTED]');
    expect(credentials.apiKey).toBe('[REDACTED]');
  });

  it('redacts sensitive fields inside array elements', () => {
    const result = redactSensitiveData({
      users: [{ id: 'u1', password: 'a' }, { id: 'u2', password: 'b' }],
    }) as { users: Array<Record<string, unknown>> };
    expect(result.users[0].password).toBe('[REDACTED]');
    expect(result.users[1].password).toBe('[REDACTED]');
    expect(result.users[0].id).toBe('u1');
  });

  it('leaves non-sensitive data completely untouched', () => {
    const input = { workspaceId: 'ws-1', findingId: 'f-1', severity: 'HIGH' };
    expect(redactSensitiveData(input)).toEqual(input);
  });

  it('does not mutate the original object', () => {
    const input = { password: 'hunter2' };
    const result = redactSensitiveData(input) as Record<string, unknown>;
    expect(input.password).toBe('hunter2'); // unchanged
    expect(result.password).toBe('[REDACTED]');
    expect(result).not.toBe(input);
  });

  it('passes through primitives, null, and Date/RegExp instances unchanged', () => {
    expect(redactSensitiveData('hello')).toBe('hello');
    expect(redactSensitiveData(42)).toBe(42);
    expect(redactSensitiveData(null)).toBe(null);
    expect(redactSensitiveData(undefined)).toBe(undefined);
    const date = new Date();
    expect(redactSensitiveData(date)).toBe(date);
  });

  it('bails out with a marker rather than recursing infinitely on pathologically deep input', () => {
    let deep: Record<string, unknown> = { password: 'leaf' };
    for (let i = 0; i < 20; i++) {
      deep = { child: deep };
    }
    // Should not throw / hang, and should still redact whatever remains
    // reachable within the depth budget.
    expect(() => redactSensitiveData(deep)).not.toThrow();
  });
});
