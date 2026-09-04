import type { AppErrorCode, AppErrorResponseDto } from '@pentesthub/shared';

/// Thrown for any non-2xx REST response. Carries the parsed
/// `AppErrorResponseDto` (the same closed error-code union every
/// PentestHub AI API handler throws — see `@pentesthub/shared`'s
/// `errors.ts`) when the API returned one, so SDK consumers can branch
/// on `error.code` instead of string-matching `error.message`.
export class PentestHubApiError extends Error {
  readonly statusCode: number;
  readonly code: AppErrorCode | 'UNKNOWN_ERROR';

  constructor(statusCode: number, body: Partial<AppErrorResponseDto> | undefined) {
    super(body?.message ?? `PentestHub AI API request failed with status ${statusCode}`);
    this.name = 'PentestHubApiError';
    this.statusCode = statusCode;
    this.code = (body?.code as AppErrorCode | undefined) ?? 'UNKNOWN_ERROR';
  }
}

export interface HttpClientOptions {
  /// Base URL of a PentestHub AI API deployment, e.g.
  /// `https://api.your-company.com` (no trailing slash, no `/api`
  /// prefix — the API mounts every route at root, see bootstrap.ts).
  baseUrl: string;
  /// A pre-issued JWT access token (from `client.auth.login()`) or a
  /// long-lived API key (Module 9's `X-API-Key` mechanism, reused
  /// unmodified by every worker/service-account-facing route in this
  /// codebase — see `ApiKeyAuthGuard`). Exactly one of `accessToken`/
  /// `apiKey` should normally be set; if both are, `accessToken` wins.
  accessToken?: string;
  apiKey?: string;
  /// Module 18 — task #526 (Phase 24: desktop/mobile/CLI/SDK reliability
  /// audit) correction of an earlier version of this comment, which
  /// incorrectly called this option unwired dead code — `HttpClient`
  /// itself never calls it (true), but `PentestHubClient`'s constructor
  /// does: it passes `(tokens) => { this.http.setAccessToken(...);
  /// options.onTokenRefreshed?.(...) }` into `AuthResource` as its
  /// `onLoginSuccess` callback (see client.ts), which fires on both
  /// `auth.login()` and `auth.refresh()`. So this option is live for any
  /// `PentestHubClient` consumer.
  ///
  /// The real, disclosed gap is narrower: there is no *automatic*
  /// refresh-on-401 anywhere in this SDK — `auth.refresh()` only runs
  /// when a consumer explicitly calls it, mirroring the raw
  /// `RefreshRequestDto`/`AUTH_ENDPOINTS.refresh` contract with no
  /// interceptor wired into `request()`. A consumer that never calls
  /// `client.auth.refresh()` before its access token expires gets a
  /// plain 401 `PentestHubApiError`, same as `apps/web`'s `client.ts`
  /// avoided by building its own coalescing-refresh-on-401 logic
  /// (Phase 23 audit) — that logic was never ported down into this SDK.
  /// This also means anyone who constructs a raw `HttpClient` directly
  /// instead of going through `PentestHubClient` (e.g. `packages/cli`'s
  /// `http.ts`) never reaches `AuthResource` at all, so their
  /// `onTokenRefreshed` never fires regardless — see the CLI-specific
  /// finding in `docs/reviews/0016-m18-cli-desktop-mobile-reliability-audit.md`.
  onTokenRefreshed?: (accessToken: string) => void;
  /// Override for testing / non-browser, non-Node runtimes; defaults to
  /// the global `fetch` (Node 18+, every modern browser, Deno, Bun).
  fetchImpl?: typeof fetch;
  /// Module 18 — task #526. Per-request timeout in milliseconds, enforced
  /// via `AbortController` — before this, a hung connection (dead
  /// network, an unresponsive deployment) had no bound at all: the
  /// `fetch()` call would await indefinitely (Node's own `fetch` has no
  /// meaningful default timeout), hanging any script or long-running
  /// process built on this SDK. Defaults to 30s, matching the general
  /// order of magnitude of `apps/api`'s own request-handling expectations
  /// (see `PentestHubHighRequestLatency`'s 2s p95 alert threshold in
  /// `deploy/prometheus/alerts.yml` — 30s is a generous multiple of that,
  /// not a tight SLA).
  timeoutMs?: number;
  /// Module 18 — task #526. Automatic retry count for idempotent (GET)
  /// requests only, on network failure or a 5xx/429 response — mutating
  /// requests (POST/PATCH/DELETE) are never retried automatically, for
  /// the same reason React Query's mutations aren't
  /// (apps/web/app/providers.tsx's doc comment on `retry: 1` covers only
  /// queries): retrying a non-idempotent request risks duplicating a
  /// side effect the caller doesn't expect. Defaults to 2 retries with
  /// exponential backoff (250ms/500ms), and honors a numeric
  /// `Retry-After` response header on 429 if present, capped at 5s so a
  /// misbehaving or malicious value can't stall a caller indefinitely.
  maxRetries?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;
const MAX_RETRY_AFTER_MS = 5_000;

export class HttpClient {
  private accessToken: string | undefined;
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(private readonly options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.accessToken = options.accessToken;
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  }

  setAccessToken(accessToken: string): void {
    this.accessToken = accessToken;
  }

  /// Module 18 — task #526. A single attempt at the underlying HTTP call,
  /// bounded by `timeoutMs` via `AbortController` — split out from
  /// `request()` so the retry loop below can call it repeatedly without
  /// duplicating the timeout/parsing logic.
  private async attempt<T>(
    method: string,
    url: URL,
    headers: Record<string, string>,
    body: unknown,
  ): Promise<AttemptOutcome<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(url.toString(), {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      if (controller.signal.aborted) {
        throw new Error(`PentestHub AI API request timed out after ${this.timeoutMs}ms: ${method} ${url.pathname}`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 204) return { result: undefined as T };

    const contentType = response.headers.get('content-type') ?? '';
    const parsed = contentType.includes('application/json') ? await response.json() : await response.text();

    if (!response.ok) {
      if (response.status === 429 || response.status >= 500) {
        const retryAfterHeader = response.headers.get('retry-after');
        const retryAfterMs = retryAfterHeader ? Math.min(Number(retryAfterHeader) * 1000, MAX_RETRY_AFTER_MS) : undefined;
        return {
          retryableStatus: response.status,
          retryAfterMs,
          retryableBody: typeof parsed === 'object' ? (parsed as Partial<AppErrorResponseDto>) : undefined,
        };
      }
      throw new PentestHubApiError(response.status, typeof parsed === 'object' ? (parsed as Partial<AppErrorResponseDto>) : undefined);
    }
    return { result: parsed as T };
  }

  async request<T>(method: string, path: string, body?: unknown, query?: Record<string, string | number | boolean | undefined>): Promise<T> {
    const url = new URL(this.baseUrl + path);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.accessToken) headers.Authorization = `Bearer ${this.accessToken}`;
    else if (this.apiKey) headers['X-API-Key'] = this.apiKey;

    // Only GET is retried automatically — see `maxRetries`'s doc comment
    // on why mutating methods are never auto-retried.
    const retriesAllowed = method === 'GET' ? this.maxRetries : 0;
    let lastRetryableStatus = 0;
    let lastRetryableBody: Partial<AppErrorResponseDto> | undefined;

    for (let attemptNumber = 0; attemptNumber <= retriesAllowed; attemptNumber++) {
      let outcome: Awaited<ReturnType<typeof this.attempt<T>>>;
      try {
        outcome = await this.attempt<T>(method, url, headers, body);
      } catch (err) {
        // A timeout or network-level failure (fetch rejecting outright)
        // is retried the same as a retryable HTTP status, up to the same
        // limit — but only for GET, per `retriesAllowed` above.
        if (attemptNumber < retriesAllowed) {
          await sleep(250 * 2 ** attemptNumber);
          continue;
        }
        throw err;
      }
      if (outcome.retryableStatus === undefined) return outcome.result as T;
      lastRetryableStatus = outcome.retryableStatus;
      lastRetryableBody = outcome.retryableBody;
      if (attemptNumber < retriesAllowed) {
        await sleep(outcome.retryAfterMs ?? 250 * 2 ** attemptNumber);
        continue;
      }
      throw new PentestHubApiError(lastRetryableStatus, lastRetryableBody);
    }
    // Unreachable (the loop always returns or throws), but keeps
    // TypeScript's control-flow analysis satisfied without an `any` cast.
    throw new PentestHubApiError(lastRetryableStatus, lastRetryableBody);
  }

  get<T>(path: string, query?: Record<string, string | number | boolean | undefined>): Promise<T> {
    return this.request<T>('GET', path, undefined, query);
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }
}
