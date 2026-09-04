// Generic API response envelope. Success bodies are wrapped by a global
// NestJS interceptor; error bodies by a global exception filter. See
// docs/adr/0001-auth-module.md decision 6.

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  statusCode: number;
  code: string;
  message: string;
  /// Module 15 — task #354 (Consistent error handling system). Same value
  /// as the `X-Request-Id` response header (see
  /// `apps/api/src/observability/request-id.middleware.ts`), duplicated
  /// into the JSON body itself so it survives being copy-pasted out of a
  /// toast or error card into a support ticket — headers don't. Cross-
  /// references 1:1 with the `requestId` field `StructuredLoggerService`
  /// attaches to every log line the same request produced. Optional
  /// because it's only set once request-context middleware has run;
  /// absent for the small number of failures that occur before that
  /// (e.g. a malformed request the body parser itself rejects).
  requestId?: string;
  /// Module 18 — task #504 (Global error handling / Phase 2). Present only
  /// for structured validation failures (code `VALIDATION_FAILED`) — one
  /// entry per invalid field, so a form can highlight the exact field
  /// instead of the caller having to string-match a flattened message.
  /// Every other error keeps `details` absent; this never carries raw
  /// values the caller submitted (only the field path + a human-readable
  /// constraint description), so it's safe to log/display as-is.
  details?: Array<{ field: string; message: string }>;
}
