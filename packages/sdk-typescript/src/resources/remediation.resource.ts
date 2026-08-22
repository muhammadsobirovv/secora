import { REMEDIATION_ENDPOINTS } from '@pentesthub/shared';
import type {
  CreateRemediationTaskRequestDto,
  FindingVerificationDto,
  FindingVerificationStatus,
  RemediationEvidenceLinkDto,
  RemediationPriority,
  RemediationStatus,
  RemediationTaskDto,
  UpdateRemediationTaskRequestDto,
} from '@pentesthub/shared';
import type { HttpClient } from '../http-client.js';

/// Module 17 — Remediation tracking + finding verification resource
/// (task #491). Mirrors `RemediationController`/
/// `FindingVerificationController` (task #477).
export class RemediationResource {
  constructor(private readonly http: HttpClient) {}

  list(params?: {
    status?: RemediationStatus;
    priority?: RemediationPriority;
    projectId?: string;
    incidentId?: string;
    findingId?: string;
    limit?: number;
  }): Promise<RemediationTaskDto[]> {
    return this.http.get<RemediationTaskDto[]>(REMEDIATION_ENDPOINTS.list(), params);
  }

  create(body: CreateRemediationTaskRequestDto): Promise<RemediationTaskDto> {
    return this.http.post<RemediationTaskDto>(REMEDIATION_ENDPOINTS.create(), body);
  }

  get(id: string): Promise<RemediationTaskDto> {
    return this.http.get<RemediationTaskDto>(REMEDIATION_ENDPOINTS.task(id));
  }

  update(id: string, body: UpdateRemediationTaskRequestDto): Promise<RemediationTaskDto> {
    return this.http.patch<RemediationTaskDto>(REMEDIATION_ENDPOINTS.task(id), body);
  }

  setStatus(id: string, status: RemediationStatus): Promise<RemediationTaskDto> {
    return this.http.patch<RemediationTaskDto>(REMEDIATION_ENDPOINTS.setStatus(id), { status });
  }

  linkEvidence(id: string, evidenceId: string): Promise<RemediationEvidenceLinkDto> {
    return this.http.post<RemediationEvidenceLinkDto>(REMEDIATION_ENDPOINTS.evidence(id), { evidenceId });
  }

  getFindingVerification(findingId: string): Promise<FindingVerificationDto> {
    return this.http.get<FindingVerificationDto>(REMEDIATION_ENDPOINTS.findingVerification(findingId));
  }

  setFindingVerification(
    findingId: string,
    status: FindingVerificationStatus,
    verificationEvidenceId?: string,
  ): Promise<FindingVerificationDto> {
    return this.http.patch<FindingVerificationDto>(REMEDIATION_ENDPOINTS.findingVerification(findingId), {
      status,
      verificationEvidenceId,
    });
  }
}
