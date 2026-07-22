import { ORGANIZATION_ENDPOINTS } from '@pentesthub/shared';
import type { CreateOrganizationRequestDto, OrganizationDto, UpdateOrganizationRequestDto } from '@pentesthub/shared';
import type { HttpClient } from '../http-client.js';

export class OrganizationsResource {
  constructor(private readonly http: HttpClient) {}

  list(): Promise<OrganizationDto[]> {
    return this.http.get<OrganizationDto[]>(ORGANIZATION_ENDPOINTS.list);
  }

  get(organizationId: string): Promise<OrganizationDto> {
    return this.http.get<OrganizationDto>(ORGANIZATION_ENDPOINTS.get(organizationId));
  }

  create(data: CreateOrganizationRequestDto): Promise<OrganizationDto> {
    return this.http.post<OrganizationDto>(ORGANIZATION_ENDPOINTS.create, data);
  }

  update(organizationId: string, data: UpdateOrganizationRequestDto): Promise<OrganizationDto> {
    return this.http.patch<OrganizationDto>(ORGANIZATION_ENDPOINTS.update(organizationId), data);
  }
}
