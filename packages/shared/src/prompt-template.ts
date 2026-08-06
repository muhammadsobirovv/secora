// Module 11 — AI Chat prompt library / conversation templates.
// A workspace-scoped, reusable prompt a user can save and re-insert into a
// new or existing conversation. "Conversation templates" (spec'd alongside
// "Prompt library" under AI Chat) reuse this same model — a template is
// just a PromptTemplate whose `category` is "conversation" instead of
// e.g. "recon" / "report-writing" — rather than a second, near-identical
// table.

export interface PromptTemplateDto {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  promptText: string;
  category: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePromptTemplateRequestDto {
  name: string;
  description?: string;
  promptText: string;
  category?: string;
}

export interface UpdatePromptTemplateRequestDto {
  name?: string;
  description?: string;
  promptText?: string;
  category?: string;
}

export interface ListPromptTemplatesQueryDto {
  category?: string;
  search?: string;
}

// ---- Module 13 — Prompt Registry additions (task #280) ----
// Versioning, prompt testing, and history on top of the Module 11 model
// above. `promptText`/`category` stay as the *current* values on
// `PromptTemplateDto` (unchanged shape, so every Module 11 caller keeps
// working); everything below is additive.

export interface PromptTemplateVersionDto {
  id: string;
  promptTemplateId: string;
  version: number;
  promptText: string;
  variables: string[] | null;
  changelog: string | null;
  createdBy: string;
  createdAt: string;
}

export interface CreatePromptTemplateVersionRequestDto {
  promptText: string;
  variables?: string[];
  changelog?: string;
}

export type PromptTestRunStatus = "SUCCEEDED" | "FAILED";

export interface PromptTestRunDto {
  id: string;
  promptTemplateId: string;
  promptTemplateVersion: number | null;
  inputVariables: Record<string, string> | null;
  renderedPrompt: string;
  outputText: string | null;
  provider: string | null;
  model: string | null;
  status: PromptTestRunStatus;
  errorMessage: string | null;
  durationMs: number | null;
  ratingScore: number | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
}

export interface RunPromptTestRequestDto {
  /// Tests a specific saved version if given, otherwise the template's
  /// current live text — Prompt Validation (task #280) happens before
  /// either path runs: `{{variable}}` placeholders in the prompt text
  /// must all appear in `inputVariables`, or the request is rejected
  /// with `PROMPT_VARIABLE_MISSING` rather than silently sending
  /// `{{variable}}` literal text to the provider.
  version?: number;
  inputVariables?: Record<string, string>;
  provider?: string;
  model?: string;
}

export interface RatePromptTestRunRequestDto {
  ratingScore: number;
  notes?: string;
}

/// Import/Export (task #280): a portable, provider-agnostic bundle —
/// the same shape a Prompt Pack's `PluginVersion.manifestJson.prompts`
/// array uses (see the Automation Marketplace section of the SDK
/// Guide), so a template exported from one workspace can be imported
/// into another, or packaged into a marketplace Prompt Pack, without a
/// format conversion step.
export interface PromptTemplateExportDto {
  name: string;
  description: string | null;
  category: string | null;
  promptText: string;
  variables: string[] | null;
}

export interface ImportPromptTemplatesRequestDto {
  templates: PromptTemplateExportDto[];
}
