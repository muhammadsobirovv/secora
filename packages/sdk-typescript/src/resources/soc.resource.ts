import { SOC_ENDPOINTS } from '@pentesthub/shared';
import type { SocDashboardSummaryDto } from '@pentesthub/shared';
import type { HttpClient } from '../http-client.js';

/// Module 17 — SOC dashboard aggregation (task #489/#491). Mirrors
/// `SocController` — a single composed read, same implicit-caller-
/// workspace posture as `KnowledgeGraphResource`.
export class SocResource {
  constructor(private readonly http: HttpClient) {}

  dashboard(windowDays?: number): Promise<SocDashboardSummaryDto> {
    return this.http.get<SocDashboardSummaryDto>(SOC_ENDPOINTS.dashboard(), { windowDays });
  }
}
