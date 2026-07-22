import { INTEGRATION_ENDPOINTS } from '@pentesthub/shared';
import type {
  ConnectIntegrationRequestDto,
  ExecuteIntegrationActionRequestDto,
  ExecuteIntegrationActionResultDto,
  IntegrationCapabilityDto,
  IntegrationConnectionDto,
  TestIntegrationConnectionResultDto,
} from '@pentesthub/shared';
import type { HttpClient } from '../http-client.js';

export class IntegrationsResource {
  constructor(private readonly http: HttpClient) {}

  capabilities(): Promise<IntegrationCapabilityDto[]> {
    return this.http.get<IntegrationCapabilityDto[]>(INTEGRATION_ENDPOINTS.capabilities);
  }

  list(organizationId: string): Promise<IntegrationConnectionDto[]> {
    return this.http.get<IntegrationConnectionDto[]>(INTEGRATION_ENDPOINTS.list(organizationId));
  }

  connect(organizationId: string, data: ConnectIntegrationRequestDto): Promise<IntegrationConnectionDto> {
    return this.http.post<IntegrationConnectionDto>(INTEGRATION_ENDPOINTS.connect(organizationId), data);
  }

  disconnect(organizationId: string, connectionId: string): Promise<void> {
    return this.http.delete<void>(INTEGRATION_ENDPOINTS.disconnect(organizationId, connectionId));
  }

  test(organizationId: string, connectionId: string): Promise<TestIntegrationConnectionResultDto> {
    return this.http.post<TestIntegrationConnectionResultDto>(INTEGRATION_ENDPOINTS.test(organizationId, connectionId));
  }

  execute(organizationId: string, connectionId: string, data: ExecuteIntegrationActionRequestDto): Promise<ExecuteIntegrationActionResultDto> {
    return this.http.post<ExecuteIntegrationActionResultDto>(INTEGRATION_ENDPOINTS.execute(organizationId, connectionId), data);
  }
}
