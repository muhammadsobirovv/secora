// Module 13 — AI Automation Platform Observability HTTP routes (task
// #290). Namespaced under `/observability/ai-platform` alongside Module
// 10's `/observability/metrics` and `/observability/health*` — same
// controller family, different auth posture (see
// `ai-platform-observability.ts`'s doc comment).

export const AI_PLATFORM_OBSERVABILITY_ENDPOINTS = {
  dashboard: "/observability/ai-platform",
} as const;
