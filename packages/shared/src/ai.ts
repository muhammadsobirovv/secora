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
  | "PAYLOAD_LIBRARY_ENTRY"
  // Module 11 (AI Security Copilot + Multi-Agent System) additions — same
  // "feed the one RAG store, don't build a parallel index" reasoning as the
  // Module 6 additions above. See the matching AiMemorySourceType enum
  // comment in schema.prisma.
  | "KNOWLEDGE_BASE_REFERENCE"
  | "AGENT_TASK_OUTPUT"
  | "ORCHESTRATION_RUN"
  // Module 16 addition — was missing from this shared union even though
  // present in the Prisma enum since task #397; ResearcherMemoryService
  // has always passed the literal string through untyped-checked call
  // sites. Restored here rather than left as a pre-existing gap.
  | "RESEARCHER_MEMORY"
  // Module 17 additions (task #485) — see the matching AiMemorySourceType
  // enum comment in schema.prisma.
  | "INCIDENT"
  | "REMEDIATION_TASK"
  | "RISK_ASSESSMENT";

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

/// Module 11 — Privacy controls (task #234). Per-workspace override of the
/// AI_ORCHESTRATOR_MODE env default (see env.validation.ts's doc comment on
/// that var): CLOUD = unrestricted provider selection (today's behavior);
/// LOCAL = restrict to providers in LOCAL_AI_PROVIDER_NAMES only, refusing
/// to fall back to a cloud provider even if the local one is unconfigured;
/// HYBRID = prefer a local provider but allow cloud fallback. Honest scope
/// note (see ADR 0007): this only restricts *which backend AI provider*
/// is used, not full Desktop-Agent-routing "local-first" compliance —
/// ADR 0007's own "bugs found" section already flags this gap.
export type AiPrivacyMode = "CLOUD" | "LOCAL" | "HYBRID";

export const AI_PRIVACY_MODES: AiPrivacyMode[] = ["CLOUD", "LOCAL", "HYBRID"];

/// The subset of AI_PROVIDER_NAMES that run self-hosted / on infrastructure
/// the workspace controls, rather than a third-party cloud API — the only
/// structural signal available today (see AiProvider interface's doc
/// comment: no `isLocal`/`kind` field exists on the provider abstraction
/// itself, so this list is the single source of truth for that
/// distinction).
export const LOCAL_AI_PROVIDER_NAMES: AiProviderName[] = ["OLLAMA"];

export interface WorkspaceAiPrivacySettingDto {
  workspaceId: string;
  mode: AiPrivacyMode;
  updatedAt: string;
  /// Module 15 — Local-first AI confirmation (task #341). Null until the
  /// workspace has explicitly acknowledged that CLOUD/HYBRID mode sends
  /// data to a third-party AI provider; set the first time
  /// UpdateWorkspaceAiPrivacyModeRequestDto.confirmCloudUsage is sent as
  /// true. Never cleared by switching to LOCAL — once a workspace has
  /// confirmed, re-enabling CLOUD/HYBRID later doesn't ask again.
  cloudUsageConfirmedAt: string | null;
}

export interface UpdateWorkspaceAiPrivacyModeRequestDto {
  mode: AiPrivacyMode;
  /// Module 15 (task #341). Required (must be `true`) the first time a
  /// workspace sets mode to CLOUD or HYBRID and has no prior
  /// cloudUsageConfirmedAt — the backend throws AI_CLOUD_USAGE_NOT_CONFIRMED
  /// otherwise, so the frontend gets a clear signal to show a one-time
  /// consent dialog ("your data may be sent to OpenAI/Anthropic/etc.") and
  /// resubmit with this set to true. Ignored (no-op) for mode: "LOCAL" and
  /// for any workspace that has already confirmed once before.
  confirmCloudUsage?: boolean;
}

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
  // Module 11 — Autonomous Recon + Vulnerability Analysis (task #228):
  // unlike every tool above (all read-only search/generation), these two
  // trigger real background work in Module 3/4 (a new ReconJob/
  // VulnScanJob) rather than just reading already-collected data.
  "start_recon_scan",
  "start_vulnerability_scan",
  // Module 11 — AI Report Writer, incremental generation (task #229):
  // persists an agent-drafted section into a real BugReport rather than
  // draft_report's throwaway text-only generation.
  "append_report_section",
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
  /// Module 11 — AI Chat conversation branching. Null for the "trunk"
  /// (a message sent normally); set when this message is a regenerated/
  /// edited branch off an earlier message, so the frontend can render a
  /// branch tree instead of a flat list.
  parentMessageId: string | null;
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

/// Module 11 — AI Chat conversation branching. Sends a new user message that
/// forks off an earlier message in the same conversation (e.g. "edit and
/// resend") instead of appending to the trunk; the resulting message and its
/// assistant reply both carry `parentMessageId` so the frontend can render
/// the branch alongside the original.
export interface BranchAiMessageRequestDto {
  parentMessageId: string;
  content: string;
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
  /// Module 11 — Privacy controls (task #234): false when this workspace's
  /// AiPrivacyMode is LOCAL and this provider isn't a local provider (see
  /// LOCAL_AI_PROVIDER_NAMES) — lets the frontend grey out cloud providers
  /// under LOCAL mode the same way it already greys out unconfigured ones,
  /// rather than letting the user pick one that will throw
  /// AiPrivacyModeViolationError on first use.
  allowedByPrivacyMode: boolean;
}

/// Module 15 — AI provider marketplace (BYOK expansion, task #341).
/// Structural signal ("does this provider run cloud-side or on
/// infrastructure the workspace controls") already exists as
/// LOCAL_AI_PROVIDER_NAMES; this catalog adds the human-facing metadata
/// (what is this, why would I pick it, where do I get a key) that turns
/// GET /ai/providers' bare configured/unconfigured list into an actual
/// browsable marketplace a workspace admin can use to decide what to set
/// up next — not just a status readout of providers already wired up.
export interface AiProviderMarketplaceCatalogEntry {
  provider: AiProviderName;
  displayName: string;
  description: string;
  /// Mirrors LOCAL_AI_PROVIDER_NAMES membership — kept as an explicit field
  /// here (rather than making the frontend re-derive it) since this DTO is
  /// the one purpose-built for display.
  category: "cloud" | "local";
  requiresApiKey: boolean;
  capabilities: ("chat" | "embeddings" | "vision")[];
  docsUrl: string;
  recommendedModels: string[];
}

export const AI_PROVIDER_MARKETPLACE: AiProviderMarketplaceCatalogEntry[] = [
  {
    provider: "OPENAI",
    displayName: "OpenAI",
    description:
      "GPT-4o/GPT-4.1 family — strong general-purpose reasoning and tool calling, plus the platform's default embeddings provider.",
    category: "cloud",
    requiresApiKey: true,
    capabilities: ["chat", "embeddings", "vision"],
    docsUrl: "https://platform.openai.com/docs/api-reference",
    recommendedModels: ["gpt-4o", "gpt-4o-mini", "gpt-4.1"],
  },
  {
    provider: "ANTHROPIC",
    displayName: "Anthropic",
    description:
      "Claude family — long-context reasoning and code generation. No embeddings API; RAG always falls back to a different embedding-capable provider.",
    category: "cloud",
    requiresApiKey: true,
    capabilities: ["chat", "vision"],
    docsUrl: "https://docs.claude.com/en/api",
    recommendedModels: ["claude-sonnet-5", "claude-opus-5", "claude-haiku-4-5"],
  },
  {
    provider: "GEMINI",
    displayName: "Google Gemini",
    description:
      "Gemini family — competitive pricing, native multimodal input, and its own embeddings API.",
    category: "cloud",
    requiresApiKey: true,
    capabilities: ["chat", "embeddings", "vision"],
    docsUrl: "https://ai.google.dev/gemini-api/docs",
    recommendedModels: ["gemini-2.0-flash", "gemini-2.0-pro"],
  },
  {
    provider: "OLLAMA",
    displayName: "Ollama (self-hosted)",
    description:
      "Runs entirely on infrastructure the workspace controls — no API key, no data leaving the workspace's own network. The only provider LOCAL privacy mode permits.",
    category: "local",
    requiresApiKey: false,
    capabilities: ["chat", "embeddings"],
    docsUrl: "https://github.com/ollama/ollama/blob/main/docs/api.md",
    recommendedModels: ["llama3.1", "mistral", "nomic-embed-text"],
  },
  {
    provider: "OPENROUTER",
    displayName: "OpenRouter",
    description:
      "Unified API in front of dozens of hosted models (including many not otherwise wired in as first-class adapters) — useful for trying alternatives without a separate integration per model. No embeddings API.",
    category: "cloud",
    requiresApiKey: true,
    capabilities: ["chat"],
    docsUrl: "https://openrouter.ai/docs",
    recommendedModels: ["openai/gpt-4o", "anthropic/claude-sonnet-4.5"],
  },
];

/// The live-status equivalent of AiProviderStatusDto, merged with its
/// catalog entry — what GET /ai/providers/marketplace actually returns.
export interface AiProviderMarketplaceEntryDto extends AiProviderMarketplaceCatalogEntry {
  configured: boolean;
  defaultModel: string | null;
  byok: boolean;
  allowedByPrivacyMode: boolean;
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

/// Module 11 — Voice Copilot enhancements. Completes Module 5 Phase 2's
/// Voice Interaction: the four cloud SpeechProvider adapters (OpenAI,
/// Azure, Google, ElevenLabs) were built and listed via GET
/// /ai/speech/providers, but had no HTTP endpoint that could actually
/// invoke transcribe()/synthesize() on them — only the browser's built-in
/// WEB_SPEECH ran end-to-end. These two request/result shapes are that
/// missing surface; WEB_SPEECH itself is never sent through these
/// endpoints (it runs entirely client-side, same as before).
export interface TranscribeAiSpeechRequestDto {
  provider: AiSpeechProviderName;
  /// BCP-47 language hint, e.g. "en-US" — optional.
  language?: string;
}

export interface TranscribeAiSpeechResultDto {
  text: string;
}

export interface SynthesizeAiSpeechRequestDto {
  provider: AiSpeechProviderName;
  text: string;
  /// Provider-specific voice identifier; each adapter documents/defaults
  /// its own when omitted.
  voice?: string;
}

/// `audioBase64` rather than a raw binary response — every other
/// resource in this API is JSON, and this keeps the speech endpoints
/// consistent with that rather than introducing a one-off binary
/// response convention.
export interface SynthesizeAiSpeechResultDto {
  audioBase64: string;
  mimeType: string;
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
