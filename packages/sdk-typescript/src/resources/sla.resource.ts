import { SLA_ENDPOINTS } from '@pentesthub/shared';
import type { SlaEventDto, SlaPolicyDto, VulnFindingSeverity } from '@pentesthub/shared';
import type { HttpClient } from '../http-client.js';

/// Module 17 — SLA Engine resource (task #491). Mirrors `SlaController`
/// (task #478).
export class SlaResource {
  constructor(private readonly http: HttpClient) {}

  policies(): Promise<SlaPolicyDto[]> {
    return this.http.get<SlaPolicyDto[]>(SLA_ENDPOINTS.policies());
  }

  upsertPolicy(severity: VulnFindingSeverity, targetHours: number): Promise<SlaPolicyDto> {
    return this.http.post<SlaPolicyDto>(SLA_ENDPOINTS.upsertPolicy(), { severity, targetHours });
  }

  events(params?: { incidentId?: string; findingId?: string; breachedOnly?: boolean; limit?: number }): Promise<SlaEventDto[]> {
    return this.http.get<SlaEventDto[]>(SLA_ENDPOINTS.events(), params);
  }
}
