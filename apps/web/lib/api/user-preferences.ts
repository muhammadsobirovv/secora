import type { UpdateUserPreferencesRequestDto, UserPreferencesDto } from "@pentesthub/shared";
import { apiFetch } from "./client";

const BASE = "/users/me/preferences";

export function getPreferences() {
  return apiFetch<UserPreferencesDto>(BASE);
}

export function updatePreferences(data: UpdateUserPreferencesRequestDto) {
  return apiFetch<UserPreferencesDto>(BASE, { method: "PATCH", body: data });
}
