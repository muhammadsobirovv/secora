import { API_KEY_ENDPOINTS } from '@pentesthub/shared';
import type { ApiKeyDto, CreateApiKeyRequestDto, CreateApiKeyResultDto, RotateApiKeyResultDto } from '@pentesthub/shared';
import type { HttpClient } from '../http-client.js';

/// Module 20 — API Keys resource (parity gap found during the final
/// hardening pass: `ApiKeysController` has existed since Module 15,
/// task #336, but was never wrapped in any SDK). Mirrors
/// `ApiKeysController` (`/public-api/keys/*`) exactly the same way
/// `incidents.resource.ts` mirrors `IncidentsController` — one thin,
/// typed method per route, no client-side logic beyond that.
export class ApiKeysResource {
  constructor(private readonly http: HttpClient) {}

  /// Omit `workspaceId` for the caller's personal keys; pass it to list a
  /// workspace's keys.
  list(workspaceId?: string): Promise<ApiKeyDto[]> {
    return this.http.get<ApiKeyDto[]>(API_KEY_ENDPOINTS.list, { workspaceId });
  }

  create(body: CreateApiKeyRequestDto): Promise<CreateApiKeyResultDto> {
    return this.http.post<CreateApiKeyResultDto>(API_KEY_ENDPOINTS.create, body);
  }

  /// 204 No Content — no body to return.
  revoke(id: string): Promise<void> {
    return this.http.delete<void>(API_KEY_ENDPOINTS.revoke(id));
  }

  rotate(id: string): Promise<RotateApiKeyResultDto> {
    return this.http.post<RotateApiKeyResultDto>(API_KEY_ENDPOINTS.rotate(id), undefined);
  }
}
