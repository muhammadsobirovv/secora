import { LEGAL_ENDPOINTS, type AcceptLegalRequestDto, type LegalStatusDto } from "@pentesthub/shared";
import { apiFetch } from "./client";

export function getLegalStatus() {
  return apiFetch<LegalStatusDto>(LEGAL_ENDPOINTS.status);
}

export function acceptLegal(data: AcceptLegalRequestDto) {
  return apiFetch<LegalStatusDto>(LEGAL_ENDPOINTS.accept, { method: "POST", body: data });
}
