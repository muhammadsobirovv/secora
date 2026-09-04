import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { createHash } from 'node:crypto';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ApiKeyAuthGuard } from './api-key-auth.guard.js';
import type { ApiKeysRepository } from '../../api-keys/domain/repositories/api-keys.repository.interface.js';
import type { ApiKey } from '../../../prisma-types.js';

/// Module 18 — task #527 (Phase 25: security-critical test hardening).
/// `ApiKeyAuthGuard` is this codebase's second authentication path (next
/// to `JwtAuthGuard`) and had no dedicated test before this phase despite
/// gating every Public API route: a bug here is a direct authn/authz
/// bypass or an unenforced rate limit, not a cosmetic issue. Covers the
/// five independent checks the guard performs in sequence — malformed
/// header, revoked key, expired key, IP allowlist, and per-key rate
/// limit — plus the happy path's `request.user`/`apiKeyScopes` population
/// that every downstream `@CurrentUser()` consumer depends on.
///
/// One thing this suite deliberately does NOT attempt: exercising
/// `checkRateLimit`'s in-memory `Map` across multiple *separate* guard
/// instances the way a real multi-instance deployment would hit it — that
/// module-level gap (no shared store across instances) is already
/// disclosed in the guard's own doc comment and doesn't need a test to
/// prove; what this suite verifies is the single-instance behavior the
/// guard is actually supposed to have.

const RAW_KEY = 'phb_test_1234567890abcdef';
const KEY_HASH = createHash('sha256').update(RAW_KEY).digest('hex');

function baseApiKey(overrides: Partial<ApiKey> = {}): ApiKey {
  return {
    id: 'key-1',
    userId: 'user-1',
    workspaceId: 'ws-1',
    name: 'CI key',
    keyHash: KEY_HASH,
    scopes: ['recon:read'],
    ipAllowlist: [],
    rateLimitPerMinute: null,
    expiresAt: null,
    revokedAt: null,
    lastUsedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as unknown as ApiKey;
}

function buildContext(headerValue: string | undefined, ip = '203.0.113.1'): ExecutionContext {
  const request = {
    header: (name: string) => (name.toLowerCase() === 'x-api-key' ? headerValue : undefined),
    ip,
  } as unknown as Request & { user?: unknown; apiKeyScopes?: string[]; apiKeyWorkspaceId?: string | null };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function buildGuard(apiKey: ApiKey | null) {
  const apiKeysRepository = {
    findByHash: jest.fn<ApiKeysRepository['findByHash']>().mockResolvedValue(apiKey),
    touchLastUsed: jest.fn<ApiKeysRepository['touchLastUsed']>().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<ApiKeysRepository>;
  const reflector = {} as Reflector;
  return { guard: new ApiKeyAuthGuard(apiKeysRepository, reflector), apiKeysRepository };
}

describe('ApiKeyAuthGuard', () => {
  beforeEach(() => {
    // The guard's rate-limit window is a module-level `Map` keyed by
    // apiKeyId — reset between tests by using a fresh key.id per test
    // instead of clearing internal state (the map isn't exported), so
    // window bleed-through can't produce a false pass/fail here.
  });

  it('rejects a request with no X-API-Key header', async () => {
    const { guard } = buildGuard(null);
    await expect(guard.canActivate(buildContext(undefined))).rejects.toMatchObject({
      code: 'API_KEY_NOT_FOUND',
    });
  });

  it('rejects a request whose key does not start with the phb_ prefix', async () => {
    const { guard } = buildGuard(null);
    await expect(guard.canActivate(buildContext('not-a-real-key'))).rejects.toMatchObject({
      code: 'API_KEY_NOT_FOUND',
    });
  });

  it('rejects when no key matches the hash (findByHash returns null)', async () => {
    const { guard, apiKeysRepository } = buildGuard(null);
    await expect(guard.canActivate(buildContext(RAW_KEY))).rejects.toMatchObject({
      code: 'API_KEY_NOT_FOUND',
    });
    expect(apiKeysRepository.findByHash).toHaveBeenCalledWith(KEY_HASH);
  });

  it('rejects a revoked key even if the hash matches', async () => {
    const apiKey = baseApiKey({ id: 'key-revoked', revokedAt: new Date('2026-01-02T00:00:00Z') });
    const { guard } = buildGuard(apiKey);
    await expect(guard.canActivate(buildContext(RAW_KEY))).rejects.toMatchObject({
      code: 'API_KEY_NOT_FOUND',
    });
  });

  it('rejects an expired key', async () => {
    const apiKey = baseApiKey({ id: 'key-expired', expiresAt: new Date('2020-01-01T00:00:00Z') });
    const { guard } = buildGuard(apiKey);
    await expect(guard.canActivate(buildContext(RAW_KEY))).rejects.toMatchObject({
      code: 'API_KEY_NOT_FOUND',
    });
  });

  it('rejects a request from an IP not on the key\'s allowlist', async () => {
    const apiKey = baseApiKey({ id: 'key-ip-1', ipAllowlist: ['198.51.100.0/24'] });
    const { guard } = buildGuard(apiKey);
    await expect(guard.canActivate(buildContext(RAW_KEY, '203.0.113.1'))).rejects.toMatchObject({
      code: 'API_KEY_IP_NOT_ALLOWLISTED',
    });
  });

  it('allows a request from an IP that matches the allowlist', async () => {
    const apiKey = baseApiKey({ id: 'key-ip-2', ipAllowlist: ['203.0.113.0/24'] });
    const { guard } = buildGuard(apiKey);
    await expect(guard.canActivate(buildContext(RAW_KEY, '203.0.113.5'))).resolves.toBe(true);
  });

  it('allows every request when ipAllowlist is empty (opt-in, not enforced by default)', async () => {
    const apiKey = baseApiKey({ id: 'key-ip-3', ipAllowlist: [] });
    const { guard } = buildGuard(apiKey);
    await expect(guard.canActivate(buildContext(RAW_KEY, '198.51.100.99'))).resolves.toBe(true);
  });

  it('enforces rateLimitPerMinute within a single sliding window', async () => {
    const apiKey = baseApiKey({ id: 'key-rate-1', rateLimitPerMinute: 2 });
    const { guard } = buildGuard(apiKey);
    const ctx1 = buildContext(RAW_KEY);
    const ctx2 = buildContext(RAW_KEY);
    const ctx3 = buildContext(RAW_KEY);

    await expect(guard.canActivate(ctx1)).resolves.toBe(true); // count=1
    await expect(guard.canActivate(ctx2)).resolves.toBe(true); // count=2, at limit
    await expect(guard.canActivate(ctx3)).rejects.toMatchObject({ code: 'API_KEY_RATE_LIMITED' }); // count=3, over
  });

  it('does not rate-limit when rateLimitPerMinute is null (unlimited)', async () => {
    const apiKey = baseApiKey({ id: 'key-rate-2', rateLimitPerMinute: null });
    const { guard } = buildGuard(apiKey);
    for (let i = 0; i < 5; i++) {
      await expect(guard.canActivate(buildContext(RAW_KEY))).resolves.toBe(true);
    }
  });

  it('populates request.user/apiKeyScopes/apiKeyWorkspaceId and fires a non-blocking touchLastUsed on success', async () => {
    const apiKey = baseApiKey({ id: 'key-ok', userId: 'user-42', workspaceId: 'ws-42', scopes: ['soc:read', 'intel:write'] });
    const { guard, apiKeysRepository } = buildGuard(apiKey);
    const request = {
      header: (name: string) => (name.toLowerCase() === 'x-api-key' ? RAW_KEY : undefined),
      ip: '203.0.113.1',
    } as unknown as Request & { user?: { id: string; sessionId: string }; apiKeyScopes?: string[]; apiKeyWorkspaceId?: string | null };
    const context = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(request.user).toMatchObject({ id: 'user-42', sessionId: 'apikey:key-ok', roles: [] });
    expect(request.apiKeyScopes).toEqual(['soc:read', 'intel:write']);
    expect(request.apiKeyWorkspaceId).toBe('ws-42');
    expect(apiKeysRepository.touchLastUsed).toHaveBeenCalledWith('key-ok');
  });
});
