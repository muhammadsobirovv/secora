import { TAG_ENDPOINTS } from "@pentesthub/shared";
import type { CreateTagRequestDto, TagDto } from "@pentesthub/shared";
import { apiFetch } from "./client";

export function listTags() {
  return apiFetch<TagDto[]>(TAG_ENDPOINTS.list);
}

export function createTag(data: CreateTagRequestDto) {
  return apiFetch<TagDto>(TAG_ENDPOINTS.create, { method: "POST", body: data });
}

export function deleteTag(id: string) {
  return apiFetch<void>(TAG_ENDPOINTS.delete(id), { method: "DELETE" });
}
