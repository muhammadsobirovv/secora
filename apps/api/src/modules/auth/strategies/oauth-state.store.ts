import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

/// Stateless CSRF-state store for the Google/GitHub OAuth strategies (see
/// docs/reviews/0001-module-1-architecture-review.md §6: "No OAuth `state`
/// parameter / CSRF protection on the OAuth flow"). This app has no
/// server-side session (JWT-only, per ADR 0001), so `passport-oauth2`'s
/// default session-backed state storage doesn't apply — instead this
/// implements the `store`/`verify` contract passport-oauth2 expects with a
/// signed, self-contained nonce: `${randomNonce}.${expiryMs}.${hmac}`.
/// The HMAC (over nonce+expiry) is what an attacker can't forge without the
/// server secret, which is what makes a crafted callback link
/// unable to complete a flow it didn't legitimately start. A short TTL
/// bounds how long a captured/replayed `state` value stays valid.
///
/// Method signatures are written to structurally match @types/passport-
/// oauth2's `StateStore` interface exactly (including its `meta`-argument
/// overloads for `store`/`verify`) — passport-oauth2 only ever calls the
/// 2-arg form in practice (the 3-arg `meta` overload exists for strategies
/// that pass extra AuthorizationParams through), but a class missing an
/// overload the interface declares isn't structurally assignable to it,
/// which otherwise breaks `super({ ..., store: new StatelessOAuthStateStore(...) })`
/// in google.strategy.ts/github.strategy.ts.
const STATE_TTL_MS = 10 * 60 * 1000;

type StoreCallback = (err: Error | null, state?: string) => void;
type VerifyCallback = (
  err: Error | null,
  ok?: boolean,
  message?: string,
) => void;

function sign(nonce: string, expiresAt: number, secret: string): string {
  return createHmac('sha256', secret)
    .update(`${nonce}.${expiresAt}`)
    .digest('hex');
}

export class StatelessOAuthStateStore {
  constructor(private readonly secret: string) {}

  store(req: Request, callback: StoreCallback): void;
  store(req: Request, meta: unknown, callback: StoreCallback): void;
  store(
    _req: Request,
    metaOrCallback: unknown,
    maybeCallback?: StoreCallback,
  ): void {
    const callback =
      typeof metaOrCallback === 'function'
        ? (metaOrCallback as StoreCallback)
        : maybeCallback!;
    const nonce = randomBytes(16).toString('hex');
    const expiresAt = Date.now() + STATE_TTL_MS;
    const signature = sign(nonce, expiresAt, this.secret);
    callback(null, `${nonce}.${expiresAt}.${signature}`);
  }

  verify(req: Request, state: string, callback: VerifyCallback): void;
  verify(
    req: Request,
    state: string,
    meta: unknown,
    callback: VerifyCallback,
  ): void;
  verify(
    _req: Request,
    providedState: string,
    metaOrCallback: unknown,
    maybeCallback?: VerifyCallback,
  ): void {
    const callback =
      typeof metaOrCallback === 'function'
        ? (metaOrCallback as VerifyCallback)
        : maybeCallback!;

    const parts =
      typeof providedState === 'string' ? providedState.split('.') : [];
    if (parts.length !== 3) {
      callback(null, false, 'Malformed OAuth state.');
      return;
    }
    const [nonce, expiresAtRaw, signature] = parts;
    const expiresAt = Number(expiresAtRaw);
    if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
      callback(null, false, 'OAuth state expired.');
      return;
    }
    const expectedSignature = sign(nonce, expiresAt, this.secret);
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    const providedBuffer = Buffer.from(signature, 'hex');
    const valid =
      expectedBuffer.length === providedBuffer.length &&
      timingSafeEqual(expectedBuffer, providedBuffer);
    if (!valid) {
      callback(null, false, 'Invalid OAuth state.');
      return;
    }
    callback(null, true);
  }
}
