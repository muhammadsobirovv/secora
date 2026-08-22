import { RISK_ENDPOINTS } from '@pentesthub/shared';
import type { ComputeRiskScoreRequestDto, RiskFactorSnapshotDto, RiskScoreV2ResultDto } from '@pentesthub/shared';
import type { HttpClient } from '../http-client.js';

/// Module 17 — Risk Engine v2 resource (task #491). Mirrors
/// `RiskController` (task #474/#475).
export class RiskResource {
  constructor(private readonly http: HttpClient) {}

  /// `body.persist === true` returns a persisted `RiskFactorSnapshotDto`;
  /// otherwise a non-persisting `RiskScoreV2ResultDto` preview — same
  /// distinction `ComputeRiskScoreRequestDto`'s own doc comment
  /// describes.
  compute(body: ComputeRiskScoreRequestDto): Promise<RiskScoreV2ResultDto | RiskFactorSnapshotDto> {
    return this.http.post<RiskScoreV2ResultDto | RiskFactorSnapshotDto>(RISK_ENDPOINTS.compute(), body);
  }

  latestForFinding(findingId: string): Promise<RiskFactorSnapshotDto | null> {
    return this.http.get<RiskFactorSnapshotDto | null>(RISK_ENDPOINTS.latestForFinding(findingId));
  }

  historyForFinding(findingId: string): Promise<RiskFactorSnapshotDto[]> {
    return this.http.get<RiskFactorSnapshotDto[]>(RISK_ENDPOINTS.historyForFinding(findingId));
  }

  latestForAsset(nodeType: string, refId: string): Promise<RiskFactorSnapshotDto | null> {
    return this.http.get<RiskFactorSnapshotDto | null>(RISK_ENDPOINTS.latestForAsset(nodeType, refId));
  }

  historyForAsset(nodeType: string, refId: string): Promise<RiskFactorSnapshotDto[]> {
    return this.http.get<RiskFactorSnapshotDto[]>(RISK_ENDPOINTS.historyForAsset(nodeType, refId));
  }
}
