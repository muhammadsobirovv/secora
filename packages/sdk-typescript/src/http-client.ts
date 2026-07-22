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
  /// Injected by `PentestHubClient` after a successful `login()`/
  /// `refresh()` call so subsequent requests use the fresh token
  /// automatically — SDK consumers don't have to manually thread the
  /// token through every call.
  onTokenRefreshed?: (accessToken: string) => void;
  /// Override for testing / non-browser, non-Node runtimes; defaults to
  /// the global `fetch` (Node 18+, every modern browser, Deno, Bun).
  fetchImpl?: typeof fetch;
}

export class HttpClient {
  private accessToken: string | undefined;
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.accessToken = options.accessToken;
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  setAccessToken(accessToken: string): void {
    this.accessToken = accessToken;
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

    const response = await this.fetchImpl(url.toString(), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (response.status === 204) return undefined as T;

    const contentType = response.headers.get('content-type') ?? '';
    const parsed = contentType.includes('application/json') ? await response.json() : await response.text();

    if (!response.ok) {
      throw new PentestHubApiError(response.status, typeof parsed === 'object' ? (parsed as Partial<AppErrorResponseDto>) : undefined);
    }
    return parsed as T;
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
