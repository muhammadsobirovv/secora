import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/// Thin typed wrapper over Tauri's `invoke()` — the Desktop Agent's
/// equivalent of `apps/web/lib/api/client.ts`'s `apiFetch`. Every command
/// registered in `src-tauri/src/lib.rs`'s `invoke_handler!` gets one
/// function here so feature hooks never call `invoke()` with a raw string
/// command name directly (same "one seam" convention as the web app's API
/// client modules). Tauri auto-converts JS camelCase argument keys to the
/// Rust command's snake_case parameter names, so every wrapper below just
/// passes a plain camelCase object.

// ---------------------------------------------------------------------
// Projects / Targets / Jobs
// ---------------------------------------------------------------------

export interface ProjectRecord {
  id: string;
  remoteId: string | null;
  name: string;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: string;
}

export interface TargetRecord {
  id: string;
  remoteId: string | null;
  projectId: string;
  type: string;
  value: string;
  createdAt: string;
  syncStatus: string;
}

export interface JobRecord {
  id: string;
  kind: string;
  tool: string;
  targetId: string;
  projectId: string;
  status: string;
  priority: number;
  attempt: number;
  maxAttempts: number;
  timeoutSeconds: number;
  errorMessage: string | null;
  exitCode: number | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------
// AI Chat
// ---------------------------------------------------------------------

export interface ProviderStatus {
  provider: string;
  configured: boolean;
  defaultModel: string | null;
  byok: boolean;
}

export interface ConversationRecord {
  id: string;
  remoteId: string | null;
  projectId: string | null;
  title: string | null;
  provider: string | null;
  model: string | null;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MessageRecord {
  id: string;
  conversationId: string;
  role: "SYSTEM" | "USER" | "ASSISTANT" | "TOOL";
  content: string;
  status: string;
  provider: string | null;
  model: string | null;
  createdAt: string;
}

export type ChatStreamEvent =
  | { type: "delta"; content: string }
  | { type: "tool_call"; toolName: string; input: unknown }
  | { type: "done"; fullContent: string }
  | { type: "error"; message: string };

// ---------------------------------------------------------------------
// Local RAG
// ---------------------------------------------------------------------

export interface RagSearchResult {
  sourceType: string;
  sourceId: string;
  projectId: string | null;
  snippet: string;
  score: number;
}

// ---------------------------------------------------------------------
// Sync Engine
// ---------------------------------------------------------------------

export type SyncMode = "OFF" | "METADATA_ONLY" | "EVERYTHING";

export interface SyncConfig {
  mode: SyncMode;
  apiBaseUrl: string | null;
  workspaceId: string | null;
  lastSyncedAt: string | null;
  intervalSeconds: number;
}

export interface SyncSummary {
  pushed: number;
  pulled: number;
  conflicts: number;
  errors: string[];
}

export interface RetryEntry {
  entityType: string;
  entityId: string;
  operation: string;
  attempt: number;
  lastError: string | null;
  createdAt: string;
}

export interface SyncConflict {
  entityType: string;
  id: string;
  remoteId: string;
}

// ---------------------------------------------------------------------
// Voice
// ---------------------------------------------------------------------

export interface VoiceSettings {
  sttBackend: "WEB_SPEECH" | "WHISPER";
  ttsBackend: "WEB_SPEECH" | "PIPER";
  whisperModelPath: string | null;
  piperModelPath: string | null;
  language: string | null;
  pushToTalk: boolean;
  continuousListening: boolean;
  readResponsesAloud: boolean;
  interruptOnNewMessage: boolean;
  webSpeechVoice: string | null;
}

export interface VoiceBackendAvailability {
  whisper: boolean;
  piper: boolean;
}

// ---------------------------------------------------------------------
// File Manager / Evidence
// ---------------------------------------------------------------------

export interface EvidenceRecord {
  id: string;
  remoteId: string | null;
  projectId: string;
  fileName: string;
  filePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  sha256: string | null;
  tags: string; // JSON-encoded array
  createdAt: string;
  syncStatus: string;
}

export interface DuplicateGroup {
  sha256: string;
  items: EvidenceRecord[];
}

// ---------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------

export interface NoteRecord {
  id: string;
  remoteId: string | null;
  projectId: string;
  title: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: string;
}

// ---------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------

export type ReportFormat = "PDF" | "MARKDOWN" | "HTML" | "DOCX" | "TXT" | "JSON" | "ZIP";

export interface ReportRecord {
  id: string;
  remoteId: string | null;
  projectId: string;
  title: string;
  format: string;
  filePath: string | null;
  content: string | null;
  createdAt: string;
  syncStatus: string;
}

// ---------------------------------------------------------------------
// Plugin System
// ---------------------------------------------------------------------

export type PluginKind = "TOOL_INTEGRATION" | "CUSTOM_SCRIPT";

export interface PluginManifest {
  kind: PluginKind;
  description: string;
  binary: string;
  argsTemplate: string[];
  timeoutSeconds: number;
}

export interface InstalledPlugin {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  manifest: PluginManifest;
  installedAt: string;
}

export const desktopApi = {
  // Projects / Targets / Jobs -----------------------------------------
  createProject: (name: string, description?: string) => invoke<ProjectRecord>("create_project", { name, description }),
  listProjects: () => invoke<ProjectRecord[]>("list_projects"),
  deleteProject: (id: string) => invoke<void>("delete_project", { id }),

  createTarget: (projectId: string, targetType: string, value: string) =>
    invoke<TargetRecord>("create_target", { projectId, targetType, value }),
  listTargets: (projectId: string) => invoke<TargetRecord[]>("list_targets", { projectId }),

  runToolJob: (input: { kind: "RECON" | "SCAN"; tool: string; targetId: string; projectId: string; priority?: number; timeoutSeconds?: number }) =>
    invoke<string>("run_tool_job", input),
  getJob: (id: string) => invoke<JobRecord | null>("get_job", { id }),
  listJobs: (projectId: string) => invoke<JobRecord[]>("list_jobs", { projectId }),
  cancelJob: (id: string) => invoke<void>("cancel_job", { id }),
  pauseJob: (id: string) => invoke<void>("pause_job", { id }),
  resumeJob: (id: string) => invoke<void>("resume_job", { id }),

  listTools: () => invoke<string[]>("list_tools"),
  toolAvailability: () => invoke<Record<string, boolean>>("tool_availability"),

  // AI --------------------------------------------------------------
  listAiProviders: () => invoke<ProviderStatus[]>("list_ai_providers"),
  saveAiProviderCredential: (provider: string, apiKey?: string, baseUrl?: string, model?: string) =>
    invoke<void>("save_ai_provider_credential", { provider, apiKey, baseUrl, model }),
  deleteAiProviderCredential: (provider: string) => invoke<void>("delete_ai_provider_credential", { provider }),

  createConversation: (projectId?: string, title?: string) => invoke<ConversationRecord>("create_conversation", { projectId, title }),
  listConversations: (projectId?: string) => invoke<ConversationRecord[]>("list_conversations", { projectId }),
  getConversation: (id: string) => invoke<ConversationRecord>("get_conversation", { id }),
  listMessages: (conversationId: string) => invoke<MessageRecord[]>("list_messages", { conversationId }),
  pinConversation: (id: string, pinned: boolean) => invoke<void>("pin_conversation", { id, pinned }),
  deleteConversation: (id: string) => invoke<void>("delete_conversation", { id }),
  sendMessage: (conversationId: string, content: string, provider?: string) =>
    invoke<string>("send_message", { conversationId, content, provider }),
  cancelGeneration: (id: string) => invoke<void>("cancel_generation", { id }),

  /// Subscribes to the streamed reply for one conversation. Mirrors the
  /// web app's SSE handling but over a Tauri event instead of an HTTP
  /// stream — same event shape (`StreamEvent`) either way, see
  /// `src-tauri/src/ai/providers/types.rs`.
  subscribeToChatStream: (conversationId: string, onEvent: (event: ChatStreamEvent) => void): Promise<UnlistenFn> =>
    listen<ChatStreamEvent>(`ai://${conversationId}/stream`, (e) => onEvent(e.payload)),

  // Local RAG ---------------------------------------------------------
  searchRag: (query: string, projectId?: string, limit?: number) => invoke<RagSearchResult[]>("search_rag", { query, projectId, limit }),
  reindexRag: () => invoke<number>("reindex_rag"),
  reindexRagEmbeddings: (provider?: string) => invoke<number>("reindex_rag_embeddings", { provider }),

  // Sync Engine ---------------------------------------------------------
  getSyncConfig: () => invoke<SyncConfig>("get_sync_config"),
  setSyncMode: (mode: SyncMode) => invoke<void>("set_sync_mode", { mode }),
  setSyncConnection: (apiBaseUrl: string, token: string) => invoke<void>("set_sync_connection", { apiBaseUrl, token }),
  disconnectSync: () => invoke<void>("disconnect_sync"),
  setSyncWorkspace: (workspaceId: string) => invoke<void>("set_sync_workspace", { workspaceId }),
  testSyncConnection: () => invoke<void>("test_sync_connection"),
  syncNow: () => invoke<SyncSummary>("sync_now"),
  listSyncRetryQueue: () => invoke<RetryEntry[]>("list_sync_retry_queue"),
  listSyncConflicts: () => invoke<SyncConflict[]>("list_sync_conflicts"),
  resolveSyncConflict: (entityType: string, id: string, keepLocal: boolean) =>
    invoke<void>("resolve_sync_conflict", { entityType, id, keepLocal }),

  // Voice ---------------------------------------------------------------
  getVoiceSettings: () => invoke<VoiceSettings>("get_voice_settings"),
  setVoiceSettings: (settings: VoiceSettings) => invoke<void>("set_voice_settings", { settings }),
  voiceBackendAvailability: () => invoke<VoiceBackendAvailability>("voice_backend_availability"),
  transcribeAudio: (audioPath: string) => invoke<string>("transcribe_audio", { audioPath }),
  synthesizeSpeech: (text: string) => invoke<string>("synthesize_speech", { text }),

  // File Manager / Evidence ---------------------------------------------
  importEvidence: (projectId: string, sourcePath: string, tags: string[]) =>
    invoke<EvidenceRecord>("import_evidence", { projectId, sourcePath, tags }),
  listEvidence: (projectId: string) => invoke<EvidenceRecord[]>("list_evidence", { projectId }),
  findDuplicateEvidence: (projectId: string) => invoke<DuplicateGroup[]>("find_duplicate_evidence", { projectId }),
  updateEvidenceTags: (id: string, tags: string[]) => invoke<void>("update_evidence_tags", { id, tags }),
  deleteEvidence: (id: string) => invoke<void>("delete_evidence", { id }),
  startFolderWatch: (projectId: string, folder: string) => invoke<void>("start_folder_watch", { projectId, folder }),
  stopFolderWatch: (projectId: string, folder: string) => invoke<void>("stop_folder_watch", { projectId, folder }),
  listFolderWatches: (projectId: string) => invoke<string[]>("list_folder_watches", { projectId }),

  // Notes -----------------------------------------------------------------
  createNote: (projectId: string, content: string, title?: string) => invoke<NoteRecord>("create_note", { projectId, title, content }),
  updateNote: (id: string, content: string, title?: string) => invoke<NoteRecord>("update_note", { id, title, content }),
  listNotes: (projectId: string) => invoke<NoteRecord[]>("list_notes", { projectId }),
  getNote: (id: string) => invoke<NoteRecord | null>("get_note", { id }),
  deleteNote: (id: string) => invoke<void>("delete_note", { id }),

  // Reports -----------------------------------------------------------------
  generateReport: (projectId: string, format: ReportFormat) => invoke<ReportRecord>("generate_report", { projectId, format }),
  listReports: (projectId: string) => invoke<ReportRecord[]>("list_reports", { projectId }),
  getReport: (id: string) => invoke<ReportRecord | null>("get_report", { id }),
  deleteReport: (id: string) => invoke<void>("delete_report", { id }),

  // Plugin System -------------------------------------------------------
  listPluginTemplates: () => invoke<[string, PluginManifest][]>("list_plugin_templates"),
  listPlugins: () => invoke<InstalledPlugin[]>("list_plugins"),
  installPlugin: (name: string, version: string, manifest: PluginManifest) => invoke<InstalledPlugin>("install_plugin", { name, version, manifest }),
  setPluginEnabled: (id: string, enabled: boolean) => invoke<void>("set_plugin_enabled", { id, enabled }),
  uninstallPlugin: (id: string) => invoke<void>("uninstall_plugin", { id }),
  runPlugin: (id: string, target: string, projectName: string) => invoke<string>("run_plugin", { id, target, projectName }),

  // Security --------------------------------------------------------------
  createEncryptedBackup: (destPath: string) => invoke<void>("create_encrypted_backup", { destPath }),
  restoreEncryptedBackup: (sourcePath: string) => invoke<string>("restore_encrypted_backup", { sourcePath }),

  // Findings (Module 8 — populated by the Browser Extension / Burp Suite
  // Extension via the Bridge Server, also creatable manually here) ------
  createFinding: (params: { projectId: string; title: string; severity?: string; targetId?: string; url?: string; description?: string; evidence?: string; tags?: string[] }) =>
    invoke<FindingRecord>("create_finding", params),
  listFindings: (projectId: string) => invoke<FindingRecord[]>("list_findings", { projectId }),
  updateFindingStatus: (id: string, status: string) => invoke<FindingRecord>("update_finding_status", { id, status }),
  deleteFinding: (id: string) => invoke<void>("delete_finding", { id }),

  // Bridge Server (Module 8 — Browser Extension / Burp Suite pairing) ---
  getBridgeInfo: () => invoke<BridgeInfo>("get_bridge_info"),
  regenerateBridgeToken: () => invoke<{ token: string; restartRequired: boolean }>("regenerate_bridge_token"),
};

// ---------------------------------------------------------------------
// Findings / Bridge (Module 8)
// ---------------------------------------------------------------------

export interface FindingRecord {
  id: string;
  remoteId: string | null;
  projectId: string;
  targetId: string | null;
  title: string;
  severity: string;
  status: string;
  source: string;
  url: string | null;
  description: string | null;
  evidence: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  syncStatus: string;
}

export interface BridgeInfo {
  port: number;
  token: string;
  baseUrl: string;
  pairingUri: string;
}
