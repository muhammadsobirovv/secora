import { describe, expect, it } from '@jest/globals';
import { createHmac } from 'node:crypto';
import { buildAuthorizeUrl, createOAuthState, verifyOAuthState } from './oauth-exchange.util.js';
import { getOAuth2ProviderConfig } from './oauth2-provider-config.js';

describe('createOAuthState / verifyOAuthState', () => {
  const secret = 'a'.repeat(32);
  const payload = { provider: 'GITHUB' as const, organizationId: 'org-1', workspaceId: 'ws-1', userId: 'user-1' };

  it('round-trips a signed state back to its original payload', () => {
    const state = createOAuthState(payload, secret);
    const verified = verifyOAuthState(state, secret);
    expect(verified).toEqual(payload);
  });

  it('rejects a state signed with a different secret', () => {
    const state = createOAuthState(payload, secret);
    const verified = verifyOAuthState(state, 'b'.repeat(32));
    expect(verified).toBeNull();
  });

  it('rejects a tampered payload segment (signature no longer matches)', () => {
    const state = createOAuthState(payload, secret);
    const [payloadB64, expiresAt, signature] = state.split('.');
    const tamperedPayload = Buffer.from(JSON.stringify({ ...payload, organizationId: 'org-evil' })).toString('base64url');
    const tampered = `${tamperedPayload}.${expiresAt}.${signature}`;
    expect(verifyOAuthState(tampered, secret)).toBeNull();
    expect(payloadB64).not.toBe(tamperedPayload);
  });

  it('rejects an expired state', () => {
    const expiredExpiry = Date.now() - 1000;
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    // Reconstruct with the same signing scheme but an already-past expiry.
    const signature = createHmac('sha256', secret).update(`${payloadB64}.${expiredExpiry}`).digest('hex');
    const state = `${payloadB64}.${expiredExpiry}.${signature}`;
    expect(verifyOAuthState(state, secret)).toBeNull();
  });

  it('rejects a malformed state string', () => {
    expect(verifyOAuthState('not-a-valid-state', secret)).toBeNull();
    expect(verifyOAuthState('a.b', secret)).toBeNull();
  });
});

describe('buildAuthorizeUrl', () => {
  it('includes client_id, redirect_uri, response_type, scope, and state', () => {
    const providerConfig = getOAuth2ProviderConfig('GITHUB')!;
    const url = buildAuthorizeUrl(providerConfig, {
      clientId: 'client-123',
      redirectUri: 'https://api.example.com/callback',
      state: 'signed-state-value',
    });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(parsed.searchParams.get('client_id')).toBe('client-123');
    expect(parsed.searchParams.get('redirect_uri')).toBe('https://api.example.com/callback');
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('state')).toBe('signed-state-value');
    expect(parsed.searchParams.get('scope')).toBe('repo');
  });

  it('applies extraAuthorizeParams (e.g. Notion owner=user)', () => {
    const providerConfig = getOAuth2ProviderConfig('NOTION')!;
    const url = buildAuthorizeUrl(providerConfig, { clientId: 'c', redirectUri: 'https://x/callback', state: 's' });
    expect(new URL(url).searchParams.get('owner')).toBe('user');
  });
});

describe('getOAuth2ProviderConfig', () => {
  it('returns null for a provider without OAuth support (e.g. AWS)', () => {
    expect(getOAuth2ProviderConfig('AWS')).toBeNull();
  });

  it('returns a config for every OAuth-capable provider', () => {
    for (const provider of ['GITHUB', 'GITLAB', 'SLACK', 'GOOGLE_DRIVE', 'DROPBOX', 'NOTION'] as const) {
      expect(getOAuth2ProviderConfig(provider)).not.toBeNull();
    }
  });
});
