import {
  EVIDENCE_ENDPOINTS,
  NOTE_ENDPOINTS,
  PROJECT_ENDPOINTS,
  TARGET_ENDPOINTS,
} from "@pentesthub/shared";
import type { AttachableType, AttachmentDto } from "@pentesthub/shared";
import { apiFetch } from "./client";

function attachmentsPathFor(attachableType: AttachableType, attachableId: string): string {
  switch (attachableType) {
    case "PROJECT":
      return PROJECT_ENDPOINTS.attachments(attachableId);
    case "TARGET":
      return TARGET_ENDPOINTS.attachments(attachableId);
    case "NOTE":
      return NOTE_ENDPOINTS.attachments(attachableId);
    case "EVIDENCE":
      return EVIDENCE_ENDPOINTS.attachments(attachableId);
    case "WORKSPACE":
      throw new Error("Workspace attachments use uploadWorkspaceAvatar, not this generic path.");
    default:
      throw new Error(`Unknown attachable type: ${String(attachableType)}`);
  }
}

export function listAttachments(attachableType: AttachableType, attachableId: string) {
  return apiFetch<AttachmentDto[]>(attachmentsPathFor(attachableType, attachableId));
}

export function uploadAttachment(attachableType: AttachableType, attachableId: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch<AttachmentDto>(attachmentsPathFor(attachableType, attachableId), {
    method: "POST",
    body: formData,
  });
}

export function deleteAttachment(id: string) {
  return apiFetch<void>(`/attachments/${id}`, { method: "DELETE" });
}
