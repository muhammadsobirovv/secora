import { NOTE_ENDPOINTS } from "@pentesthub/shared";
import type { CreateNoteRequestDto, NoteDto, UpdateNoteRequestDto } from "@pentesthub/shared";
import { apiFetch } from "./client";

export function listNotes(projectId: string, targetId?: string) {
  const qs = targetId ? `?targetId=${targetId}` : "";
  return apiFetch<NoteDto[]>(`${NOTE_ENDPOINTS.list(projectId)}${qs}`);
}

export function getNote(id: string) {
  return apiFetch<NoteDto>(NOTE_ENDPOINTS.get(id));
}

export function createNote(projectId: string, data: CreateNoteRequestDto) {
  return apiFetch<NoteDto>(NOTE_ENDPOINTS.create(projectId), { method: "POST", body: data });
}

export function updateNote(id: string, data: UpdateNoteRequestDto) {
  return apiFetch<NoteDto>(NOTE_ENDPOINTS.update(id), { method: "PATCH", body: data });
}

export function deleteNote(id: string) {
  return apiFetch<void>(NOTE_ENDPOINTS.delete(id), { method: "DELETE" });
}
