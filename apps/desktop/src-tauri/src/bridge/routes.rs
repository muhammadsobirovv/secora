//! Bridge Server route handlers. Registered onto the router in
//! `bridge::mod::router()`. Every handler here runs behind
//! `bridge::auth::require_token` + `bridge::middleware::encrypt_layer`
//! (see `bridge::mod` for the exact `Router` wiring/ordering) except
//! `health`, which is intentionally reachable unauthenticated so the
//! extension's "is the Desktop Agent even running" check doesn't need a
//! token first.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Json};
use futures::stream::Stream;
use futures::StreamExt as _;
use serde::Deserialize;
use std::convert::Infallible;
use std::sync::Arc;

use crate::ai::providers::StreamEvent;
use crate::bridge::captures;
use crate::bridge::dto::*;
use crate::bridge::state::BridgeState;
use crate::error::AppError;
use crate::storage::repositories::findings::NewFinding;

type JsonResult<T> = Result<Json<T>, (StatusCode, Json<serde_json::Value>)>;

fn err_response(e: AppError) -> (StatusCode, Json<serde_json::Value>) {
    let status = match e.code.as_str() {
        "CONFIRMATION_REQUIRED" => StatusCode::FORBIDDEN,
        "PROJECT_NOT_FOUND" | "TARGET_NOT_FOUND" | "FINDING_NOT_FOUND" | "NOTE_NOT_FOUND" | "JOB_NOT_FOUND" => StatusCode::NOT_FOUND,
        _ => StatusCode::BAD_REQUEST,
    };
    (status, Json(serde_json::json!({ "code": e.code, "message": e.message })))
}

// ---------------------------------------------------------------------
// Health / pairing
// ---------------------------------------------------------------------

pub async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "ok": true,
        "name": "PentestHub AI Desktop Agent",
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

pub async fn pair(State(state): State<BridgeState>, Json(body): Json<PairRequest>) -> Json<PairResponse> {
    // Reaching this handler at all means `require_token` already
    // accepted the `Authorization: Bearer` header — `body.token` is
    // compared too only so a client that sends a *mismatched* header vs.
    // body token (a client bug, not a security boundary) gets a clear
    // `valid: false` instead of a confusing 200.
    let valid = body.token == *state.token;
    Json(PairResponse { valid, agent_version: env!("CARGO_PKG_VERSION").to_string(), agent_name: "PentestHub AI Desktop Agent".to_string() })
}

// ---------------------------------------------------------------------
// Projects / targets
// ---------------------------------------------------------------------

pub async fn list_projects(State(state): State<BridgeState>) -> JsonResult<Vec<crate::storage::repositories::projects::ProjectRecord>> {
    state.app.projects.list().await.map(Json).map_err(err_response)
}

#[derive(Deserialize)]
pub struct TargetsQuery {
    pub project_id: String,
}

pub async fn list_targets(State(state): State<BridgeState>, Query(q): Query<TargetsQuery>) -> JsonResult<Vec<crate::storage::repositories::targets::TargetRecord>> {
    state.app.targets.list_by_project(&q.project_id).await.map(Json).map_err(err_response)
}

// ---------------------------------------------------------------------
// Target Capture
// ---------------------------------------------------------------------

pub async fn create_capture(State(state): State<BridgeState>, Json(body): Json<CaptureRequest>) -> JsonResult<CaptureResponse> {
    captures::handle_capture(&state, body).await.map(Json).map_err(err_response)
}

// ---------------------------------------------------------------------
// Recon Shortcuts (right-click menu -> Desktop Agent job queue)
// ---------------------------------------------------------------------

pub async fn start_job(State(state): State<BridgeState>, Json(body): Json<StartJobRequest>) -> JsonResult<StartJobResponse> {
    let (kind, tool) = match body.shortcut.as_str() {
        "recon" => ("RECON", "SUBFINDER"),
        "httpx" => ("RECON", "HTTPX"),
        "katana" => ("RECON", "KATANA"),
        "nuclei" => ("SCAN", "NUCLEI"),
        "dirscan" => ("SCAN", "FFUF"),
        other => return Err(err_response(AppError::new("UNKNOWN_SHORTCUT", format!("\"{other}\" is not a recognized recon shortcut.")))),
    };

    let id = uuid::Uuid::new_v4().to_string();
    state
        .app
        .job_queue
        .enqueue(&id, kind, tool, &body.target_id, &body.project_id, 0, 600)
        .await
        .map_err(err_response)?;

    state.live.update(
        crate::bridge::live::LiveSyncState { current_scan_job_id: Some(id.clone()), ..Default::default() },
        "extension",
    ).await;

    Ok(Json(StartJobResponse { job_id: id, tool: tool.to_string() }))
}

#[derive(Deserialize)]
pub struct JobsQuery {
    pub project_id: String,
}

pub async fn list_jobs(State(state): State<BridgeState>, Query(q): Query<JobsQuery>) -> JsonResult<Vec<crate::storage::repositories::jobs::JobRecord>> {
    state.app.jobs.list_by_project(&q.project_id).await.map(Json).map_err(err_response)
}

pub async fn get_job(State(state): State<BridgeState>, Path(id): Path<String>) -> JsonResult<Option<crate::storage::repositories::jobs::JobRecord>> {
    state.app.jobs.get(&id).await.map(Json).map_err(err_response)
}

// ---------------------------------------------------------------------
// AI Side Panel — streamed over Server-Sent Events (works from a MV3
// background/sidepanel `fetch()` + `ReadableStream` reader without the
// bidirectional complexity a WebSocket would add for a strictly
// request -> stream-of-deltas shape).
// ---------------------------------------------------------------------

pub async fn ai_analyze(State(state): State<BridgeState>, Json(body): Json<AiAnalyzeRequest>) -> impl IntoResponse {
    // The conversation is created *before* the stream starts (not inside
    // the spawned task) specifically so its id can be handed back as a
    // response header — `Sse`'s body has already started framing
    // `data: ...` lines by the time the first delta would otherwise
    // arrive, so there's no in-band place to send it once streaming
    // begins. The Side Panel reads `X-Conversation-Id` to keep
    // multi-turn context across quick actions (see
    // `sidepanel/SidePanel.tsx`'s `conversationId` state) instead of
    // starting a brand-new conversation on every message.
    let conversation_id = match &body.conversation_id {
        Some(id) => id.clone(),
        None => match state.app.chat.create_conversation(body.project_id.as_deref(), Some(&format!("Browser Extension: {}", body.action))).await {
            Ok(record) => record.id,
            Err(e) => {
                let (status, body) = err_response(e);
                return (status, body).into_response();
            }
        },
    };

    let (tx, rx) = tokio::sync::mpsc::unbounded_channel::<StreamEvent>();
    let on_delta: Arc<dyn Fn(StreamEvent) + Send + Sync> = Arc::new(move |event: StreamEvent| {
        let _ = tx.send(event);
    });

    let prompt = captures::build_ai_prompt(&body.action, body.page_url.as_deref(), body.page_context.as_deref());
    let chat = state.app.chat.clone();
    let provider = body.provider.clone();
    let conversation_id_for_task = conversation_id.clone();

    tokio::spawn(async move {
        if let Err(e) = chat.send_message(&conversation_id_for_task, &prompt, provider.as_deref(), on_delta).await {
            eprintln!("Bridge AI analyze: send_message failed: {e}");
        }
    });

    let stream = tokio_stream::wrappers::UnboundedReceiverStream::new(rx).map(|event| {
        let data = serde_json::to_string(&event).unwrap_or_else(|_| "{}".to_string());
        Ok(Event::default().data(data))
    });

    let mut response = Sse::new(stream).keep_alive(KeepAlive::default()).into_response();
    if let Ok(header_value) = axum::http::HeaderValue::from_str(&conversation_id) {
        response.headers_mut().insert("X-Conversation-Id", header_value);
    }
    response
}

// ---------------------------------------------------------------------
// Findings — Burp "Create Finding" + Browser Extension AI-flagged issues
// ---------------------------------------------------------------------

pub async fn create_finding(State(state): State<BridgeState>, Json(body): Json<CreateFindingRequest>) -> JsonResult<crate::storage::repositories::findings::FindingRecord> {
    let id = uuid::Uuid::new_v4().to_string();
    let tags = body.tags.unwrap_or_default();
    let record = state
        .app
        .findings
        .create(
            &id,
            NewFinding {
                project_id: &body.project_id,
                target_id: body.target_id.as_deref(),
                title: &body.title,
                severity: body.severity.as_deref().unwrap_or("INFO"),
                source: body.source.as_deref().unwrap_or("BROWSER_EXTENSION"),
                url: body.url.as_deref(),
                description: body.description.as_deref(),
                evidence: body.evidence.as_deref(),
                tags: &tags,
            },
        )
        .await
        .map_err(err_response)?;

    state.live.notify(&crate::bridge::live::Notification::Finding {
        title: "New finding".to_string(),
        message: record.title.clone(),
        finding_id: record.id.clone(),
    });

    Ok(Json(record))
}

#[derive(Deserialize)]
pub struct FindingsQuery {
    pub project_id: String,
}

pub async fn list_findings(State(state): State<BridgeState>, Query(q): Query<FindingsQuery>) -> JsonResult<Vec<crate::storage::repositories::findings::FindingRecord>> {
    state.app.findings.list(&q.project_id).await.map(Json).map_err(err_response)
}

#[derive(Deserialize)]
pub struct UpdateFindingStatusRequest {
    pub status: String, // OPEN | CONFIRMED | FIXED | FALSE_POSITIVE
}

pub async fn update_finding_status(
    State(state): State<BridgeState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateFindingStatusRequest>,
) -> JsonResult<crate::storage::repositories::findings::FindingRecord> {
    state.app.findings.update_status(&id, &body.status).await.map(Json).map_err(err_response)
}

// ---------------------------------------------------------------------
// Notes — Burp "Create Note" / extension "Generate Report Draft"
// ---------------------------------------------------------------------

pub async fn create_note(State(state): State<BridgeState>, Json(body): Json<CreateNoteRequest>) -> JsonResult<crate::storage::repositories::notes::NoteRecord> {
    let id = uuid::Uuid::new_v4().to_string();
    state.app.notes.create(&id, &body.project_id, body.title.as_deref(), &body.content).await.map(Json).map_err(err_response)
}

// ---------------------------------------------------------------------
// Payload Library — custom payloads only (built-ins ship in the
// extension bundle, see captures.rs's doc comment).
// ---------------------------------------------------------------------

#[derive(Deserialize)]
pub struct PayloadsQuery {
    pub category: Option<String>,
}

pub async fn list_payloads(State(state): State<BridgeState>, Query(q): Query<PayloadsQuery>) -> JsonResult<Vec<crate::storage::repositories::payloads::PayloadRecord>> {
    state.app.payloads.list(q.category.as_deref()).await.map(Json).map_err(err_response)
}

#[derive(Deserialize)]
pub struct CreatePayloadRequest {
    pub category: String,
    pub title: String,
    pub description: Option<String>,
    pub example: String,
    pub tags: Option<Vec<String>>,
}

pub async fn create_payload(State(state): State<BridgeState>, Json(body): Json<CreatePayloadRequest>) -> JsonResult<crate::storage::repositories::payloads::PayloadRecord> {
    let id = uuid::Uuid::new_v4().to_string();
    let tags = body.tags.unwrap_or_default();
    state
        .app
        .payloads
        .create(&id, &body.category, &body.title, body.description.as_deref(), &body.example, &tags)
        .await
        .map(Json)
        .map_err(err_response)
}

// ---------------------------------------------------------------------
// Live Sync
// ---------------------------------------------------------------------

pub async fn get_live_sync(State(state): State<BridgeState>) -> Json<crate::bridge::live::LiveSyncState> {
    Json(state.live.snapshot().await)
}

#[derive(Deserialize)]
pub struct LiveSyncUpdateRequest {
    #[serde(flatten)]
    pub patch: crate::bridge::live::LiveSyncState,
    /// "desktop" | "extension" | "burp" — whoever's pushing the update,
    /// so the other clients' UI can show e.g. "synced from Burp".
    pub source: Option<String>,
}

pub async fn update_live_sync(State(state): State<BridgeState>, Json(body): Json<LiveSyncUpdateRequest>) -> Json<crate::bridge::live::LiveSyncState> {
    let updated = state.live.update(body.patch, body.source.as_deref().unwrap_or("unknown")).await;
    Json(updated)
}

pub async fn ws_upgrade(State(state): State<BridgeState>, ws: axum::extract::ws::WebSocketUpgrade) -> impl IntoResponse {
    ws.on_upgrade(move |socket| crate::bridge::ws::handle_socket(socket, state))
}
