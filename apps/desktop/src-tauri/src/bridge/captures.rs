//! Turns a Browser Extension `CaptureRequest` into a local record.
//!
//! Three destinations, chosen by `capture_type`:
//!   - `url` / `domain` / `subdomain` -> upserts a `Target` (dedupes
//!     against the project's existing targets by exact value match, so
//!     clicking "Save current Domain" twice on the same site doesn't
//!     create duplicate targets).
//!   - everything else that's naturally a *file* (`html`, `javascript`,
//!     `screenshot`, `request`, `response`) -> Evidence Library entry,
//!     written under the same `evidence/{project_id}/` layout
//!     `evidence_commands::import_evidence` uses, so both paths produce
//!     evidence the desktop UI already knows how to list/preview.
//!   - everything structured/short (`headers`, `cookies`,
//!     `local_storage`, `session_storage`, `forms`, `api_endpoints`,
//!     `graphql_endpoints`, `websocket_urls`, `csp`, `cors`,
//!     `security_headers`) -> a Note (JSON pretty-printed into the note
//!     body with a descriptive title), since Notes are already Local RAG
//!     indexed (`rag::indexer`) and these captures are exactly the kind
//!     of short structured text a later "what CSP did this target use"
//!     search benefits from — Evidence files are not RAG indexed today
//!     (see `rag::indexer`'s doc comment), so routing here instead of to
//!     Evidence is a deliberate searchability choice, not an oversight.

use crate::bridge::dto::{CaptureRequest, CaptureResponse};
use crate::bridge::state::BridgeState;
use crate::error::{AppError, AppResult};
use crate::services::hashing;

const FILE_CAPTURE_TYPES: &[&str] = &["html", "javascript", "screenshot", "request", "response"];
const TARGET_CAPTURE_TYPES: &[&str] = &["url", "domain", "subdomain"];

pub async fn handle_capture(state: &BridgeState, req: CaptureRequest) -> AppResult<CaptureResponse> {
    if req.sensitive.unwrap_or(false) && !req.confirmed.unwrap_or(false) {
        return Err(AppError::new(
            "CONFIRMATION_REQUIRED",
            "This capture is flagged sensitive and was not explicitly confirmed by the user before being sent.",
        ));
    }

    if TARGET_CAPTURE_TYPES.contains(&req.capture_type.as_str()) {
        return save_as_target(state, &req).await;
    }

    if FILE_CAPTURE_TYPES.contains(&req.capture_type.as_str()) {
        return save_as_evidence(state, &req).await;
    }

    save_as_note(state, &req).await
}

async fn save_as_target(state: &BridgeState, req: &CaptureRequest) -> AppResult<CaptureResponse> {
    let value = req.data.clone().unwrap_or_else(|| req.page_url.clone());
    let target_type = match req.capture_type.as_str() {
        "url" => "URL",
        "subdomain" => "SUBDOMAIN",
        _ => "DOMAIN",
    };

    let existing = state.app.targets.list_by_project(&req.project_id).await?;
    if let Some(found) = existing.into_iter().find(|t| t.value == value && t.target_type == target_type) {
        return Ok(CaptureResponse { saved_as: "target".to_string(), id: found.id });
    }

    let id = uuid::Uuid::new_v4().to_string();
    let record = state.app.targets.create(&id, &req.project_id, target_type, &value).await?;
    Ok(CaptureResponse { saved_as: "target".to_string(), id: record.id })
}

async fn save_as_evidence(state: &BridgeState, req: &CaptureRequest) -> AppResult<CaptureResponse> {
    let bytes: Vec<u8> = if let Some(b64) = &req.data_base64 {
        base64_decode(b64).ok_or_else(|| AppError::new("INVALID_BASE64", "data_base64 was not valid base64."))?
    } else if let Some(text) = &req.data {
        text.as_bytes().to_vec()
    } else {
        return Err(AppError::new("EMPTY_CAPTURE", "Neither data nor data_base64 was provided."));
    };

    let ext = extension_for(&req.capture_type, req.mime_type.as_deref());
    let dest_dir = state.data_dir.join("evidence").join(&req.project_id);
    tokio::fs::create_dir_all(&dest_dir).await.map_err(AppError::from)?;

    let id = uuid::Uuid::new_v4().to_string();
    let file_name = format!("{}-{}.{ext}", req.capture_type, chrono_stamp());
    let dest_path = dest_dir.join(format!("{id}-{file_name}"));
    tokio::fs::write(&dest_path, &bytes).await.map_err(AppError::from)?;

    let sha256 = hashing::sha256_file(&dest_path).await?;
    let mime_type = req.mime_type.as_deref().or_else(|| hashing::guess_mime_type(&dest_path));

    let mut tags = req.tags.clone().unwrap_or_default();
    tags.push("browser-extension".to_string());
    tags.push(req.capture_type.clone());

    let record = state
        .app
        .evidence
        .create(&id, &req.project_id, &file_name, &dest_path.to_string_lossy(), mime_type, bytes.len() as i64, &sha256, &tags)
        .await?;
    Ok(CaptureResponse { saved_as: "evidence".to_string(), id: record.id })
}

async fn save_as_note(state: &BridgeState, req: &CaptureRequest) -> AppResult<CaptureResponse> {
    let body = req.data.clone().unwrap_or_default();
    let pretty = serde_json::from_str::<serde_json::Value>(&body).ok().and_then(|v| serde_json::to_string_pretty(&v).ok()).unwrap_or(body);

    let title = format!("[{}] {}", capture_type_label(&req.capture_type), req.page_url);
    let content = format!("Captured via Browser Extension from {}\n\n```\n{}\n```", req.page_url, pretty);

    let id = uuid::Uuid::new_v4().to_string();
    let record = state.app.notes.create(&id, &req.project_id, Some(&title), &content).await?;
    Ok(CaptureResponse { saved_as: "note".to_string(), id: record.id })
}

fn capture_type_label(capture_type: &str) -> String {
    capture_type.replace('_', " ")
}

fn extension_for(capture_type: &str, mime: Option<&str>) -> &'static str {
    if let Some(mime) = mime {
        if mime.contains("png") {
            return "png";
        }
        if mime.contains("jpeg") {
            return "jpg";
        }
    }
    match capture_type {
        "html" => "html",
        "javascript" => "js",
        "screenshot" => "png",
        "request" | "response" => "txt",
        _ => "txt",
    }
}

fn chrono_stamp() -> String {
    chrono::Utc::now().format("%Y%m%dT%H%M%S").to_string()
}

/// Builds the prompt sent to the AI Chat backend (`ChatService::
/// send_message`) for a Side Panel "AI Assistant" action — folds the
/// action label and whatever page context the extension already
/// extracted into one instruction. Kept intentionally simple (no
/// per-action prompt templates registry) since the model does the real
/// work; this just gives it a clear task and the raw material.
pub fn build_ai_prompt(action: &str, page_url: Option<&str>, page_context: Option<&str>) -> String {
    let mut prompt = format!("Action: {action}\n");
    if let Some(url) = page_url {
        prompt.push_str(&format!("Page URL: {url}\n"));
    }
    if let Some(context) = page_context {
        // Cap at ~40k chars (~10k tokens) so one oversized page capture
        // can't blow the provider's context window silently — truncation
        // is noted in-band so the model (and a human reading the
        // transcript later) knows the input was cut, not that the page
        // was actually that short.
        const MAX_CONTEXT_CHARS: usize = 40_000;
        if context.len() > MAX_CONTEXT_CHARS {
            prompt.push_str(&format!("\nPage context (truncated to {MAX_CONTEXT_CHARS} chars):\n{}\n[...truncated]", &context[..MAX_CONTEXT_CHARS]));
        } else {
            prompt.push_str(&format!("\nPage context:\n{context}\n"));
        }
    }
    prompt.push_str("\nRespond as a security assistant helping a penetration tester / bug bounty hunter. Be specific and actionable.");
    prompt
}

const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

fn base64_decode(s: &str) -> Option<Vec<u8>> {
    let s = s.trim_end_matches('=');
    let mut out = Vec::with_capacity(s.len() * 3 / 4);
    let mut buf = 0u32;
    let mut bits = 0u32;
    for c in s.chars() {
        let val = ALPHABET.iter().position(|&b| b as char == c)? as u32;
        buf = (buf << 6) | val;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
        }
    }
    Some(out)
}
