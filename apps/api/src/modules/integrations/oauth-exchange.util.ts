import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IntegrationProvider } from '@pentesthub/shared';
import type { OAuth2ProviderConfig } from './oauth2-provider-config.js';

/// CSRF-state signing for the integrations OAuth "start/complete" flow —
/// the same stateless signed-nonce shape as
/// `auth/strategies/oauth-state.store.ts`, but self-contained (encodes
/// provider/organizationId/workspaceId/userId directly in the state
/// string) since this flow isn't driven by passport-oauth2's
/// store/verify contract: `StartOAuthConnectionCommand` mints the state,
/// `CompleteOAuthConnectionCommand` verifies + decodes it on the
/// callback. TTL bounds how long a captured authorize-URL stays
/// completable.
const STATE_TTL_MS = 10 * 60 * 1000;

export interface OAuthStatePayload {
  provider: IntegrationProvider;
  organizationId: string;
  workspaceId: string | null;
  userId: string;
}

function sign(payloadB64: string, expiresAt: number, secret: string): string {
  return createHmac('sha256', secret).update(`${payloadB64}.${expiresAt}`).digest('hex');
}

export function createOAuthState(payload: OAuthStatePayload, secret: string): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const expiresAt = Date.now() + STATE_TTL_MS;
  const signature = sign(payloadB64, expiresAt, secret);
  return `${payloadB64}.${expiresAt}.${signature}`;
}

/// Returns the decoded payload if `state` is well-formed, unexpired, and
/// its signature verifies against `secret`; otherwise `null`. Callers
/// must treat `null` as "reject the callback" (INTEGRATION_OAUTH_STATE_INVALID),
/// never fall back to trusting an unsigned/expired state.
export function verifyOAuthState(state: string, secret: string): OAuthStatePayload | null {
  const parts = state.split('.');
  if (parts.length !== 3) return null;
  const [payloadB64, expiresAtRaw, signature] = parts;
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;

  const expected = sign(payloadB64, expiresAt, secret);
  const expectedBuffer = Buffer.from(expected, 'hex');
  const providedBuffer = Buffer.from(signature, 'hex');
  if (expectedBuffer.length !== providedBuffer.length || !timingSafeEqual(expectedBuffer, providedBuffer)) {
    return null;
  }

  try {
    const json = Buffer.from(payloadB64, 'base64url').toString('utf8');
    return JSON.parse(json) as OAuthStatePayload;
  } catch {
    return null;
  }
}

/// A fresh random component folded into the signed state (in addition to
/// the payload) so two `StartOAuthConnection` calls for the same
/// provider/org/user never produce an identical state string — defends
/// against naive replay-detection assumptions on the provider side.
export function randomStateNonce(): string {
  return randomBytes(12).toString('hex');
}

export function buildAuthorizeUrl(
  providerConfig: OAuth2ProviderConfig,
  params: { clientId: string; redirectUri: string; state: string },
): string {
  const url = new URL(providerConfig.authorizeUrl);
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('response_type', 'code');
  if (providerConfig.scope) url.searchParams.set('scope', providerConfig.scope);
  url.searchParams.set('state', params.state);
  for (const [key, value] of Object.entries(providerConfig.extraAuthorizeParams ?? {})) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

/// Performs the authorization-code -> access-token exchange (standard
/// RFC 6749 §4.1.3 request shape — `application/x-www-form-urlencoded`
/// POST body, `Accept: application/json` since GitHub defaults to a
/// form-encoded response body otherwise). Throws a plain `Error` (the
/// caller command wraps it as `INTEGRATION_OAUTH_EXCHANGE_FAILED`) on
/// any non-2xx response or a response missing a usable access token.
export async function exchangeAuthorizationCode(
  providerConfig: OAuth2ProviderConfig,
  params: { clientId: string; clientSecret: string; code: string; redirectUri: string },
): Promise<string> {
  const body = new URLSearchParams({
    client_id: params.clientId,
    client_secret: params.clientSecret,
    code: params.code,
    redirect_uri: params.redirectUri,
    grant_type: 'authorization_code',
  });
  const response = await fetch(providerConfig.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  });
  const text = await response.text();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`OAuth token exchange returned a non-JSON response (${response.status}): ${text.slice(0, 300)}`);
  }
  if (response.status >= 300) {
    throw new Error(`OAuth token exchange failed (${response.status}): ${JSON.stringify(parsed)}`);
  }
  const accessToken = providerConfig.extractAccessToken(parsed);
  if (!accessToken) {
    throw new Error(`OAuth token exchange response did not contain a usable access token: ${JSON.stringify(parsed)}`);
  }
  return accessToken;
}
