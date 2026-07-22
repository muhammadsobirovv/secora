// Module 5 — AI Security Copilot. Mirrors the shape/conventions of
// vuln.ts (Module 4); see docs/adr/0005-ai-security-copilot-module.md.

export type AiProviderName = "OPENAI" | "ANTHROPIC" | "GEMINI" | "OLLAMA" | "OPENROUTER";

/// Voice Interaction (Module 5 Phase 2). WEB_SPEECH is the browser's
/// built-in Web Speech API — always "configured" (no key needed) since it
/// runs entirely client-side; the other four are cloud adapters, each
/// unconfigured until the project owner supplies keys (same posture as
/// AiProviderName above).
export type AiSpeechProviderName = "WEB_SPEECH" | "OPENAI_SPEECH" | "AZURE_SPEECH" | "GOOGLE_SPEECH" | "ELEVENLABS";

export type AiSpeechCapability = "transcribe" | "synthesize";

export type AiMessageRole = "SYSTEM" | "USER" | "ASSISTANT" | "TOOL";

export type AiMessageStatus = "PENDING" | "STREAMING" | "COMPLETE" | "FAILED" | "CANCELLED";

export type AiMemorySourceType =
  | "FINDING"
  | "RECON_FINDING"
  | "NOTE"
  | "EVIDENCE"
  | "CONVERSATION_MESSAGE"
  | "SCAN_TEMPLATE"
  | "TARGET"
  | "PROJECT"
  | "CUSTOM"
  // Module 6 (Bug Bounty Workspace) additions — see the matching
  // AiMemorySourceType enum comment in schema.prisma.
  | "BUGBOUNTY_FINDING"
  | "BUG_REPORT"
  | "PAYLOAD_LIBRARY_ENTRY";

/// Every provider the abstraction supports (AI Provider Architecture).
/// Phase 1 ships all five as structurally-complete adapters; which ones are
/// actually callable depends purely on which API keys are configured (see
/// GET /ai/providers, which reports `configured: boolean` per provider —
/// "changing providers must only require configuration").
export const AI_PROVIDER_NAMES: AiProviderName[] = [
  "OPENAI",
  "ANTHROPIC",
  "GEMINI",
  "OLLAMA",
  "OPENROUTER",
];

export const AI_SPEECH_PROVIDER_NAMES: AiSpeechProviderName[] = [
  "WEB_SPEECH",
  "OPENAI_SPEECH",
  "AZURE_SPEECH",
  "GOOGLE_SPEECH",
  "ELEVENLABS",
];

/// The internal platform tools the AI can call (AI Tool Calling). Kept here
/// (not just as backend constants) so the frontend can render tool-call
/// indicators ("Searched Findings...") with a friendly label without
/// hardcoding a second copy of this list.
export const AI_TOOL_NAMES = [
  "search_findings",
  "search_recon_data",
  "search_evidence",
  "search_notes",
  "search_projects",
  "search_targets",
  "search_templates",
  "create_note",
  "draft_report",
  "generate_poc",
  "generate_payloads",
] as const;

export type AiToolName = (typeof AI_TOOL_NAMES)[number];

export interface AiToolCallLogDto {
  id: string;
  conversationId: string;
  messageId: string | null;
  toolName: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: string;
}

export interface AiMessageDto {
  id: string;
  conversationId: string;
  role: AiMessageRole;
  content: string;
  status: AiMessageStatus;
  provider: AiProviderName | null;
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  bookmarked: boolean;
  pinned: boolean;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  toolCalls: AiToolCallLogDto[];
}

export interface AiConversationDto {
  id: string;
  workspaceId: string;
  projectId: string;
  userId: string;
  title: string | null;
  provider: AiProviderName | null;
  model: string | null;
  pinned: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastMessagePreview: string | null;
}

export interface AiConversationDetailDto extends AiConversationDto {
  messages: AiMessageDto[];
}

export interface CreateAiConversationRequestDto {
  projectId: string;
  title?: string;
  provider?: AiProviderName;
  model?: string;
}

export interface ListAiConversationsQueryDto {
  projectId?: string;
  search?: string;
  pinned?: boolean;
  limit?: number;
}

export interface SendAiMessageRequestDto {
  content: string;
  /// Optional context override — normally the backend auto-gathers
  /// workspace/project context (Automatic AI Context), but a caller can
  /// pin the AI to a specific finding/target/etc. (e.g. "Explain this
  /// finding" button elsewhere in the app deep-linking into a fresh
  /// conversation).
  focusEntityType?: AiMemorySourceType;
  focusEntityId?: string;
}

export interface RegenerateAiMessageRequestDto {
  messageId: string;
}

/// A single provider's availability, surfaced so the frontend's provider
/// selector can grey out anything unconfigured instead of letting the user
/// pick a provider that will 500 on first use.
export interface AiProviderStatusDto {
  provider: AiProviderName;
  configured: boolean;
  defaultModel: string | null;
  /// Local-First Migration Phase 1 (BYOK) — true when this workspace has
  /// its own stored credential for this provider, false when it's falling
  /// back to the operator's server-configured key (or unconfigured).
  byok: boolean;
}

/// A single speech provider's availability (Voice Interaction), mirroring
/// AiProviderStatusDto's "list up front, never hide behind a 500" shape.
export interface AiSpeechProviderStatusDto {
  provider: AiSpeechProviderName;
  configured: boolean;
  capabilities: AiSpeechCapability[];
}

export interface AiSuggestedQuestionDto {
  label: string;
  prompt: string;
}

/// One event on an assistant message's live SSE stream (Streaming Chat).
/// Shared between backend (AiChatStreamEvent, chat/ai-chat-stream-event.ts)
/// and frontend (useAiMessageStream) so the wire shape can't drift.
export type AiChatMessageStreamEvent =
  | { type: "delta"; content: string }
  | { type: "tool_call"; toolName: string; input: Record<string, unknown> }
  | { type: "tool_result"; toolName: string; output: Record<string, unknown> }
  | { type: "done"; message: AiMessageDto }
  | { type: "error"; message: string }
  | { type: "cancelled" };

/// What GET /ai/context/:projectId returns — the "Context Indicator" the
/// spec calls for: a terse summary of what the AI currently knows about,
/// without the user ever pasting anything in manually.
export interface AiContextSummaryDto {
  workspaceId: string;
  projectId: string;
  targetCount: number;
  reconFindingCount: number;
  vulnFindingCount: number;
  noteCount: number;
  evidenceCount: number;
  openCriticalOrHighFindings: number;
  lastActivityAt: string | null;
}

/// Local-First Migration Phase 1 (BYOK) — a workspace's own stored AI
/// provider credential. Never carries the raw or encrypted API key itself,
/// only `keyPreview` (last 4 characters, e.g. "••••ab12") so the settings
/// UI can show "a key is saved" and let the user tell which key is which
/// without the secret ever round-tripping back to the browser.
export interface AiProviderCredentialDto {
  id: string;
  provider: AiProviderName;
  keyPreview: string | null;
  baseUrl: string | null;
  model: string | null;
  createdAt: string;
  updatedAt: string;
}

/// Body for PUT /ai/provider-credentials/:provider. All fields optional —
/// a caller can update just `baseUrl`/`model` (e.g. pointing at a local
/// Ollama instance) without supplying `apiKey`, since Ollama needs none.
/// Sending an empty string for a field clears it; omitting a field leaves
/// the existing stored value untouched (upsert semantics, not full replace).
export interface UpsertAiProviderCredentialRequestDto {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}
