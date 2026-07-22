// Shared types across background/content/popup/options/devtools/sidepanel.
// Mirrors the Rust Bridge Server's DTOs (`apps/desktop/src-tauri/src/bridge/dto.rs`)
// field-for-field so a payload built here needs no translation layer on
// the way out — both sides agreed on camelCase JSON.

export type CaptureType =
  | "url"
  | "domain"
  | "subdomain"
  | "request"
  | "response"
  | "headers"
  | "cookies"
  | "local_storage"
  | "session_storage"
  | "screenshot"
  | "html"
  | "javascript"
  | "forms"
  | "api_endpoints"
  | "graphql_endpoints"
  | "websocket_urls"
  | "csp"
  | "cors"
  | "security_headers";

export interface CaptureRequest {
  projectId: string;
  targetId?: string;
  captureType: CaptureType;
  pageUrl: string;
  data?: string;
  dataBase64?: string;
  mimeType?: string;
  tags?: string[];
  sensitive?: boolean;
  confirmed?: boolean;
}

export interface CaptureResponse {
  savedAs: "evidence" | "target" | "note";
  id: string;
}

export interface StartJobRequest {
  projectId: string;
  targetId: string;
  shortcut: "recon" | "nuclei" | "dirscan" | "httpx" | "katana";
}

export interface StartJobResponse {
  jobId: string;
  tool: string;
}

export interface AiAnalyzeRequest {
  projectId?: string;
  conversationId?: string;
  action: string;
  pageUrl?: string;
  pageContext?: string;
  provider?: string;
}

export interface CreateFindingRequest {
  projectId: string;
  targetId?: string;
  title: string;
  severity?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  source?: "MANUAL" | "BURP" | "BROWSER_EXTENSION" | "AI";
  url?: string;
  description?: string;
  evidence?: string;
  tags?: string[];
}

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

export interface CreateNoteRequest {
  projectId: string;
  title?: string;
  content: string;
}

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
  status: string;
  progress: number | null;
  targetId: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PayloadRecord {
  id: string;
  remoteId: string | null;
  category: string;
  title: string;
  description: string | null;
  example: string;
  tags: string[];
  createdAt: string;
  syncStatus: string;
}

export interface LiveSyncState {
  currentProjectId: string | null;
  currentTargetId: string | null;
  currentConversationId: string | null;
  currentScanJobId: string | null;
  clipboard: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

export type StreamEvent =
  | { type: "Delta"; content: string }
  | { type: "ToolCall"; toolName: string; args: unknown }
  | { type: "Done"; fullContent: string }
  | { type: "Error"; message: string };

// ---------------------------------------------------------------------
// Extension-local settings (chrome.storage.local), not sent to the bridge
// ---------------------------------------------------------------------

export interface BridgeConnection {
  baseUrl: string; // e.g. "http://127.0.0.1:47821"
  token: string;
  pairedAt: string;
}

export interface ExtensionSettings {
  bridge: BridgeConnection | null;
  theme: "system" | "light" | "dark";
  language: string;
  aiProvider: string | null;
  captureRules: {
    autoConfirmNonSensitive: boolean;
    warnOnSensitive: boolean;
    blurScreenshotsByDefault: boolean;
  };
  privacy: {
    captureConsoleLogs: boolean;
    captureIndexedDbMetadata: boolean;
  };
  notifications: {
    onFindingCreated: boolean;
    onJobComplete: boolean;
    onCaptureSaved: boolean;
  };
  keyboardShortcutsEnabled: boolean;
  voice: {
    enabled: boolean;
    autoReadAiResponses: boolean;
  };
}

export interface ExtensionState {
  currentProjectId: string | null;
  currentTargetId: string | null;
  recentCaptures: Array<{ id: string; type: CaptureType; pageUrl: string; savedAs: string; at: string }>;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  bridge: null,
  theme: "system",
  language: "en",
  aiProvider: null,
  captureRules: {
    autoConfirmNonSensitive: true,
    warnOnSensitive: true,
    blurScreenshotsByDefault: false,
  },
  privacy: {
    captureConsoleLogs: false,
    captureIndexedDbMetadata: true,
  },
  notifications: {
    onFindingCreated: true,
    onJobComplete: true,
    onCaptureSaved: false,
  },
  keyboardShortcutsEnabled: true,
  voice: {
    enabled: true,
    autoReadAiResponses: false,
  },
};

// ---------------------------------------------------------------------
// Internal chrome.runtime message protocol (popup/content/sidepanel/
// devtools -> background, which owns the bridge connection)
// ---------------------------------------------------------------------

export type ExtensionMessage =
  | { kind: "capture"; payload: CaptureRequest }
  | { kind: "startJob"; payload: StartJobRequest }
  | { kind: "createFinding"; payload: CreateFindingRequest }
  | { kind: "createNote"; payload: CreateNoteRequest }
  | { kind: "getState" }
  | { kind: "setCurrentProject"; projectId: string }
  | { kind: "setCurrentTarget"; targetId: string }
  | { kind: "listProjects" }
  | { kind: "listTargets"; projectId: string }
  | { kind: "getSettings" }
  | { kind: "setSettings"; settings: ExtensionSettings }
  | { kind: "testBridgeConnection"; baseUrl: string; token: string }
  | { kind: "pair"; baseUrl: string; token: string }
  | { kind: "unpair" }
  | { kind: "getPageContext" } // background -> content, request/response reversed
  | { kind: "runReconShortcut"; shortcut: StartJobRequest["shortcut"] }
  | { kind: "captureScreenshot"; area: "viewport" | "full" | "selection" }
  | { kind: "bugBountyPlatformDetected"; platform: string; url: string }
  | { kind: "areaSelectionComplete"; rect: { x: number; y: number; width: number; height: number }; devicePixelRatio: number }
  | { kind: "extractProgramScope" }
  | { kind: "gatherAiContext"; action: string }
  | { kind: "getDevToolsSnapshot"; tabId: number }
  | { kind: "importProgramScope"; scope: ExtractedProgramScope };

export interface ExtractedProgramScope {
  platform: string;
  programName: string | null;
  inScope: string[];
  outOfScope: string[];
  policyText: string | null;
  bountyTable: Array<{ severity: string; reward: string }>;
  knownRestrictions: string[];
  sourceUrl: string;
}

export interface ExtensionResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}
