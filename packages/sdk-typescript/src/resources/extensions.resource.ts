import { EXTENSION_REGISTRY_ENDPOINTS } from '@pentesthub/shared';
import type {
  ExtensionDto,
  ExtensionInvocationResultDto,
  InvokeExtensionRequestDto,
  ListExtensionsQueryDto,
  RegisterExtensionRequestDto,
} from '@pentesthub/shared';
import type { HttpClient } from '../http-client.js';

/// Module 16 — Extension API registry. Register/list/get/enable/disable/
/// unregister for the caller's own workspace — matches
/// `ExtensionRegistryController` exactly (see its own doc comment for
/// why there's no `workspaceId` parameter here either).
export class ExtensionsResource {
  constructor(private readonly http: HttpClient) {}

  list(filter?: ListExtensionsQueryDto): Promise<ExtensionDto[]> {
    // `HttpClient.get`'s query param is typed as a plain index-signature
    // record; `ListExtensionsQueryDto` is a named interface (no index
    // signature), so TS won't structurally widen it — same shape as every
    // other typed-DTO-as-query-params call in this SDK. The cast is safe:
    // every field on this DTO is already `string | number | boolean |
    // undefined`.
    return this.http.get<ExtensionDto[]>(
      EXTENSION_REGISTRY_ENDPOINTS.list(),
      filter as Record<string, string | number | boolean | undefined> | undefined,
    );
  }

  get(extensionId: string): Promise<ExtensionDto> {
    return this.http.get<ExtensionDto>(EXTENSION_REGISTRY_ENDPOINTS.extension(extensionId));
  }

  register(data: RegisterExtensionRequestDto): Promise<ExtensionDto> {
    return this.http.post<ExtensionDto>(EXTENSION_REGISTRY_ENDPOINTS.register(), data);
  }

  enable(extensionId: string): Promise<ExtensionDto> {
    return this.http.post<ExtensionDto>(EXTENSION_REGISTRY_ENDPOINTS.enable(extensionId));
  }

  disable(extensionId: string): Promise<ExtensionDto> {
    return this.http.post<ExtensionDto>(EXTENSION_REGISTRY_ENDPOINTS.disable(extensionId));
  }

  unregister(extensionId: string): Promise<void> {
    return this.http.delete<void>(EXTENSION_REGISTRY_ENDPOINTS.unregister(extensionId));
  }

  /// Hardening pass (task #454): the real invocation path — the server
  /// runs `ExtensionPermissionEnforcer.assertAuthorized()` before ever
  /// contacting the extension's entrypoint. `ok: false` on the result
  /// (bad status code, network error) is not thrown as an SDK error —
  /// only a 403/404/400 from the platform's own authorization/validation
  /// is; see `ExtensionInvocationResultDto`'s doc comment.
  invoke(extensionId: string, data: InvokeExtensionRequestDto): Promise<ExtensionInvocationResultDto> {
    return this.http.post<ExtensionInvocationResultDto>(EXTENSION_REGISTRY_ENDPOINTS.invoke(extensionId), data);
  }
}
