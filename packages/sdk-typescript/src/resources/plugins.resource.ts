import { PLUGIN_INSTALLATION_ENDPOINTS, PLUGIN_REGISTRY_ENDPOINTS } from '@pentesthub/shared';
import type {
  ExecutePluginHookRequestDto,
  ExecutePluginHookResultDto,
  InstallPluginRequestDto,
  ListPluginsQueryDto,
  PluginDto,
  PluginInstallationDto,
} from '@pentesthub/shared';
import type { HttpClient } from '../http-client.js';

export class PluginsResource {
  constructor(private readonly http: HttpClient) {}

  list(filter?: ListPluginsQueryDto): Promise<PluginDto[]> {
    return this.http.get<PluginDto[]>(PLUGIN_REGISTRY_ENDPOINTS.list, filter);
  }

  get(pluginId: string): Promise<PluginDto> {
    return this.http.get<PluginDto>(PLUGIN_REGISTRY_ENDPOINTS.get(pluginId));
  }

  listInstallations(organizationId: string, workspaceId?: string): Promise<PluginInstallationDto[]> {
    return this.http.get<PluginInstallationDto[]>(PLUGIN_INSTALLATION_ENDPOINTS.list(organizationId), { workspaceId });
  }

  install(organizationId: string, data: InstallPluginRequestDto): Promise<PluginInstallationDto> {
    return this.http.post<PluginInstallationDto>(PLUGIN_INSTALLATION_ENDPOINTS.install(organizationId), data);
  }

  uninstall(organizationId: string, installationId: string): Promise<void> {
    return this.http.delete<void>(PLUGIN_INSTALLATION_ENDPOINTS.uninstall(organizationId, installationId));
  }

  executeHook(organizationId: string, installationId: string, data: ExecutePluginHookRequestDto): Promise<ExecutePluginHookResultDto> {
    return this.http.post<ExecutePluginHookResultDto>(PLUGIN_INSTALLATION_ENDPOINTS.execute(organizationId, installationId), data);
  }
}
