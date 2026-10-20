import { TARGET_ENDPOINTS, TARGET_OWNERSHIP_ENDPOINTS, targetAuthorizationEndpoints } from "@pentesthub/shared";
import type {
  AttestTargetAuthorizationRequestDto,
  CreateTargetRequestDto,
  TargetAuthorizationDto,
  TargetAuthorizationStatusDto,
  TargetOwnershipStatusDto,
  ListTargetsQueryDto,
  TargetDto,
  UpdateTargetRequestDto,
} from "@pentesthub/shared";
import { apiFetch } from "./client";

export function listTargets(projectId: string, filter: ListTargetsQueryDto = {}) {
  const params = new URLSearchParams();
  if (filter.type) params.set("type", filter.type);
  if (filter.scopeStatus) params.set("scopeStatus", filter.scopeStatus);
  if (filter.tagId) params.set("tagId", filter.tagId);
  const qs = params.toString();
  return apiFetch<TargetDto[]>(`${TARGET_ENDPOINTS.list(projectId)}${qs ? `?${qs}` : ""}`);
}

export function getTarget(id: string) {
  return apiFetch<TargetDto>(TARGET_ENDPOINTS.get(id));
}

export function createTarget(projectId: string, data: CreateTargetRequestDto) {
  return apiFetch<TargetDto>(TARGET_ENDPOINTS.create(projectId), { method: "POST", body: data });
}

export function updateTarget(id: string, data: UpdateTargetRequestDto) {
  return apiFetch<TargetDto>(TARGET_ENDPOINTS.update(id), { method: "PATCH", body: data });
}

export function deleteTarget(id: string) {
  return apiFetch<void>(TARGET_ENDPOINTS.delete(id), { method: "DELETE" });
}

export function tagTarget(id: string, tagId: string) {
  return apiFetch<void>(TARGET_ENDPOINTS.tag(id, tagId), { method: "POST" });
}

export function untagTarget(id: string, tagId: string) {
  return apiFetch<void>(TARGET_ENDPOINTS.tag(id, tagId), { method: "DELETE" });
}

export function getTargetAuthorization(id: string) {
  return apiFetch<TargetAuthorizationStatusDto>(targetAuthorizationEndpoints.status(id));
}

export function attestTargetAuthorization(id: string, data: AttestTargetAuthorizationRequestDto) {
  return apiFetch<TargetAuthorizationDto>(targetAuthorizationEndpoints.attest(id), { method: "POST", body: data });
}

export function getTargetOwnership(id: string) {
  return apiFetch<TargetOwnershipStatusDto>(TARGET_OWNERSHIP_ENDPOINTS.status(id));
}

export function createTargetOwnershipChallenge(id: string) {
  return apiFetch<TargetOwnershipStatusDto>(TARGET_OWNERSHIP_ENDPOINTS.challenge(id), { method: "POST" });
}

export function verifyTargetOwnership(id: string) {
  return apiFetch<TargetOwnershipStatusDto>(TARGET_OWNERSHIP_ENDPOINTS.verify(id), { method: "POST" });
}
