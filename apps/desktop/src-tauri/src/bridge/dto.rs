//! Request/response bodies for the Bridge Server — deliberately separate
//! types from the Tauri `commands/*` DTOs even where they overlap
//! (`CreateFindingBody` vs. `findings_commands::create_finding`'s
//! params), because the two IPC surfaces have different trust models:
//! Tauri commands are only reachable from the app's own webview, while
//! Bridge routes are reachable from any process holding the pairing
//! token, so their inputs get their own (slightly stricter/defaulted)
//! shapes rather than reusing command signatures 1:1.

use serde::{Deserialize, Serialize};

/// One of the ~19 "Target Capture" one-click actions from the Module 8
/// spec. Kept as a plain `String` (not a Rust enum) on the wire so a
/// future new capture type added to the extension doesn't require a
/// Desktop Agent update in lockstep — the handler falls back to a
/// generic "unknown" bucket (still saved, just untagged specially) for
/// any value it doesn't recognize.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureRequest {
    pub project_id: String,
    pub target_id: Option<String>,
    pub capture_type: String, // "url" | "domain" | "subdomain" | "request" | "response" | "headers" | "cookies" | "local_storage" | "session_storage" | "screenshot" | "html" | "javascript" | "forms" | "api_endpoints" | "graphql_endpoints" | "websocket_urls" | "csp" | "cors" | "security_headers"
    pub page_url: String,
    /// Text payload for text-shaped captures (HTML/JS/headers-as-JSON/
    /// endpoints list/etc). Mutually exclusive with `data_base64`.
    pub data: Option<String>,
    /// Base64 payload for binary captures (screenshots).
    pub data_base64: Option<String>,
    pub mime_type: Option<String>,
    pub tags: Option<Vec<String>>,
    /// Set by the extension when the user has explicitly confirmed
    /// saving sensitive data (cookies/tokens/localStorage that might
    /// contain secrets) — the "Require explicit confirmation" security
    /// rule from the spec is enforced client-side (the confirmation
    /// dialog itself lives in the extension, since only it knows what's
    /// actually sensitive on a given page) but the Bridge Server still
    /// refuses to persist a capture flagged `sensitive: true` unless this
    /// is `true`, as defense in depth against a compromised/buggy
    /// extension build silently skipping its own dialog.
    pub sensitive: Option<bool>,
    pub confirmed: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureResponse {
    pub saved_as: String, // "evidence" | "target" | "note"
    pub id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartJobRequest {
    pub project_id: String,
    pub target_id: String,
    /// "recon" | "nuclei" | "dirscan" | "httpx" | "katana"
    pub shortcut: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartJobResponse {
    pub job_id: String,
    pub tool: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAnalyzeRequest {
    pub project_id: Option<String>,
    pub conversation_id: Option<String>,
    /// One of Explain Page / Analyze Forms / Analyze JavaScript / Find
    /// Interesting Endpoints / Analyze Security Headers / Analyze CSP /
    /// Analyze CORS / Suggest Payloads / Generate PoC / Generate Report
    /// Draft / Summarize Findings / or a free-form user question — the
    /// bridge doesn't special-case these beyond folding them into the
    /// prompt (`bridge::captures::build_ai_prompt`), all real judgment
    /// happens in the model.
    pub action: String,
    pub page_url: Option<String>,
    pub page_context: Option<String>, // trimmed HTML/text/forms/etc. the extension already extracted
    pub provider: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFindingRequest {
    pub project_id: String,
    pub target_id: Option<String>,
    pub title: String,
    pub severity: Option<String>, // defaults to INFO
    pub source: Option<String>,   // defaults to "BROWSER_EXTENSION"; Burp sends "BURP"
    pub url: Option<String>,
    pub description: Option<String>,
    pub evidence: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateNoteRequest {
    pub project_id: String,
    pub title: Option<String>,
    pub content: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairRequest {
    /// The pairing code shown in Settings > Browser Extension is the
    /// token itself (see `bridge::auth`) — `/api/pair` exists only so
    /// the extension's Options page can validate a pasted token *before*
    /// saving it (clearer error than a silent 401 on the first real
    /// call), it doesn't grant anything `Authorization: Bearer` doesn't
    /// already grant.
    pub token: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairResponse {
    pub valid: bool,
    pub agent_version: String,
    pub agent_name: String,
}
