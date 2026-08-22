import { THREAT_INTEL_ENDPOINTS } from '@pentesthub/shared';
import type {
  CreateIndicatorRequestDto,
  IndicatorDto,
  IndicatorStatus,
  IndicatorType,
  ThreatActorDto,
  ThreatCampaignDto,
  ThreatIntelImportLogDto,
  ThreatReportDto,
  ThreatRelationshipDto,
  ThreatTechniqueDto,
} from '@pentesthub/shared';
import type { HttpClient } from '../http-client.js';

/// Module 17 — Threat Intelligence resource (task #491). Mirrors
/// `ThreatIntelController` (`/intel/*`, tasks #465-469).
export class ThreatIntelResource {
  constructor(private readonly http: HttpClient) {}

  listIndicators(params?: { type?: IndicatorType; status?: IndicatorStatus; search?: string; limit?: number }): Promise<IndicatorDto[]> {
    return this.http.get<IndicatorDto[]>(THREAT_INTEL_ENDPOINTS.indicators(), params);
  }

  getIndicator(id: string): Promise<IndicatorDto> {
    return this.http.get<IndicatorDto>(THREAT_INTEL_ENDPOINTS.indicator(id));
  }

  createIndicator(body: CreateIndicatorRequestDto): Promise<IndicatorDto> {
    return this.http.post<IndicatorDto>(THREAT_INTEL_ENDPOINTS.indicators(), body);
  }

  setIndicatorStatus(id: string, status: IndicatorStatus): Promise<IndicatorDto> {
    return this.http.patch<IndicatorDto>(THREAT_INTEL_ENDPOINTS.setIndicatorStatus(id), { status });
  }

  actors(): Promise<ThreatActorDto[]> {
    return this.http.get<ThreatActorDto[]>(THREAT_INTEL_ENDPOINTS.actors());
  }

  campaigns(): Promise<ThreatCampaignDto[]> {
    return this.http.get<ThreatCampaignDto[]>(THREAT_INTEL_ENDPOINTS.campaigns());
  }

  reports(): Promise<ThreatReportDto[]> {
    return this.http.get<ThreatReportDto[]>(THREAT_INTEL_ENDPOINTS.reports());
  }

  techniques(): Promise<ThreatTechniqueDto[]> {
    return this.http.get<ThreatTechniqueDto[]>(THREAT_INTEL_ENDPOINTS.techniques());
  }

  relationships(objectType: string, objectId: string): Promise<ThreatRelationshipDto[]> {
    return this.http.get<ThreatRelationshipDto[]>(THREAT_INTEL_ENDPOINTS.relationships(objectType, objectId));
  }

  importLogs(): Promise<ThreatIntelImportLogDto[]> {
    return this.http.get<ThreatIntelImportLogDto[]>(THREAT_INTEL_ENDPOINTS.importLogs());
  }

  refresh(sourceType?: string): Promise<ThreatIntelImportLogDto> {
    return this.http.post<ThreatIntelImportLogDto>(THREAT_INTEL_ENDPOINTS.refresh(), { sourceType });
  }

  importStix(bundle: unknown): Promise<ThreatIntelImportLogDto> {
    return this.http.post<ThreatIntelImportLogDto>(THREAT_INTEL_ENDPOINTS.importStix(), { bundle });
  }

  taxiiPoll(collectionUrl: string): Promise<ThreatIntelImportLogDto> {
    return this.http.post<ThreatIntelImportLogDto>(THREAT_INTEL_ENDPOINTS.taxiiPoll(), { collectionUrl });
  }
}
