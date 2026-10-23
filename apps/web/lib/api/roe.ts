import type {
  CreateRoeRequestDto,
  RoeAuthorizationDto,
  RoePublicOutcome,
  RoePublicRequestDto,
} from "@pentesthub/shared";
import { apiFetch, apiFetchResponse } from "./client";

/// Client engagement ("I'm testing for a client") authorizations. The request
/// goes out as multipart: the details as one JSON field, the evidence file (a
/// signed PDF, an image or a saved .eml) as another.
export function createRoeRequest(data: CreateRoeRequestDto, evidence: File | null) {
  const body = new FormData();
  body.append("data", JSON.stringify(data));
  if (evidence) body.append("evidence", evidence);
  return apiFetch<RoeAuthorizationDto>("/roe", { method: "POST", body });
}

export function listRoe() {
  return apiFetch<RoeAuthorizationDto[]>("/roe");
}

export function getRoe(id: string) {
  return apiFetch<RoeAuthorizationDto>(`/roe/${encodeURIComponent(id)}`);
}

export function resendRoe(id: string) {
  return apiFetch<RoeAuthorizationDto>(`/roe/${encodeURIComponent(id)}/resend`, { method: "POST" });
}

export function cancelRoe(id: string) {
  return apiFetch<RoeAuthorizationDto>(`/roe/${encodeURIComponent(id)}/cancel`, { method: "POST" });
}

/// Evidence is fetched with the user's token and saved as a file, never opened
/// inline in the page.
export async function downloadRoeEvidence(id: string): Promise<Blob> {
  const res = await apiFetchResponse(`/roe/${encodeURIComponent(id)}/evidence`);
  return res.blob();
}

/// The client's pages: no login, the single-use link token is the credential.
export function getPublicRoe(token: string) {
  return apiFetch<RoePublicRequestDto>(`/roe/public/${encodeURIComponent(token)}`, { public: true });
}

export function decidePublicRoe(token: string, action: "approve" | "decline" | "revoke") {
  return apiFetch<{ outcome: RoePublicOutcome }>(`/roe/public/${encodeURIComponent(token)}/${action}`, {
    method: "POST",
    public: true,
  });
}
