import { EXTENSION_REGISTRY_ENDPOINTS } from '@pentesthub/shared';
import type { ExtensionDto, ListExtensionsQueryDto, RegisterExtensionRequestDto } from '@pentesthub/shared';
import type { HttpClient } from '../http-client.js';

/// Module 16 — Extension API registry. Register/list/get/enable/disable/
/// unregister for the caller's own workspace — matches
/// `ExtensionRegistryController` exactly (see its own doc comment for
/// why there's no `workspaceId` parameter here either).
export class ExtensionsResource {
  constructor(private readonly http: HttpClient) {}

  list(filter?: ListExtensionsQueryDto): Promise<ExtensionDto[]> {
    return this.http.get<ExtensionDto[]>(EXTENSION_REGISTRY_ENDPOINTS.list(), filter);
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
}
