import { SEARCH_ENDPOINTS } from "@pentesthub/shared";
import type { SearchResultDto } from "@pentesthub/shared";
import { apiFetch } from "./client";

export function search(q: string) {
  return apiFetch<SearchResultDto[]>(`${SEARCH_ENDPOINTS.search}?q=${encodeURIComponent(q)}`);
}
