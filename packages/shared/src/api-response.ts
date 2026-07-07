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
}
