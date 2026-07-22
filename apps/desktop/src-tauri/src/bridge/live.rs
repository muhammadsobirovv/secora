//! Live Sync — Desktop Agent <-> Browser Extension (and Burp Extension)
//! realtime state, per Module 8's spec: "Current Project, Current Target,
//! Clipboard, Current Scan, Current AI Conversation, Notifications."
//!
//! Design: a single in-memory `LiveSyncState` guarded by a `RwLock`,
//! mutated via `POST /api/live-sync` by *either* side (the desktop
//! frontend when the user switches project/target in its own UI, or the
//! extension when the user switches in the popup), and a `tokio::sync::
//! broadcast` channel that fans out a lightweight `{"type":"changed"}`
//! ping to every connected WebSocket client whenever the state changes.
//!
//! Deliberately *not* a full event-sourcing/CRDT sync — the state is
//! small (a handful of scalar fields), last-write-wins is fine for "what
//! am I looking at right now" UI state, and clients always re-fetch the
//! authoritative snapshot via `GET /api/live-sync` on receiving the ping
//! rather than trusting a partial WS payload. This mirrors the Sync
//! Engine's (`sync::engine`) push/pull separation at a much smaller
//! scale: WS is the invalidation signal, REST is the data.
//!
//! Job/scan progress specifically: rather than rewiring every existing
//! Tauri event emitter (`job://{id}/log` etc., see `ipc::mod`) to also
//! push into this hub, `current_scan` is set explicitly by
//! `jobs_commands::run_tool_job`'s bridge-facing counterpart
//! (`bridge::routes::start_recon_job`) when a job is *started* from the
//! extension, and cleared/updated by a short poll loop the extension runs
//! against `GET /api/jobs/:id` — avoids a second event-plumbing path for
//! the same data the Job Queue already exposes.

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveSyncState {
    pub current_project_id: Option<String>,
    pub current_target_id: Option<String>,
    pub current_conversation_id: Option<String>,
    pub current_scan_job_id: Option<String>,
    pub clipboard: Option<String>,
    pub updated_at: Option<String>,
    pub updated_by: Option<String>, // "desktop" | "extension" | "burp"
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum Notification {
    Info { title: String, message: String },
    Success { title: String, message: String },
    Warning { title: String, message: String },
    Finding { title: String, message: String, finding_id: String },
}

pub struct LiveSyncHub {
    state: RwLock<LiveSyncState>,
    tx: broadcast::Sender<String>,
}

impl LiveSyncHub {
    pub fn new() -> Arc<Self> {
        let (tx, _rx) = broadcast::channel(128);
        Arc::new(Self { state: RwLock::new(LiveSyncState::default()), tx })
    }

    pub async fn snapshot(&self) -> LiveSyncState {
        self.state.read().await.clone()
    }

    pub async fn update(&self, mut patch: LiveSyncState, updated_by: &str) -> LiveSyncState {
        let mut guard = self.state.write().await;
        if patch.current_project_id.is_some() {
            guard.current_project_id = patch.current_project_id.take();
        }
        if patch.current_target_id.is_some() {
            guard.current_target_id = patch.current_target_id.take();
        }
        if patch.current_conversation_id.is_some() {
            guard.current_conversation_id = patch.current_conversation_id.take();
        }
        if patch.current_scan_job_id.is_some() {
            guard.current_scan_job_id = patch.current_scan_job_id.take();
        }
        if patch.clipboard.is_some() {
            guard.clipboard = patch.clipboard.take();
        }
        guard.updated_at = Some(chrono::Utc::now().to_rfc3339());
        guard.updated_by = Some(updated_by.to_string());
        let snapshot = guard.clone();
        drop(guard);
        self.ping("state-changed");
        snapshot
    }

    pub fn notify(&self, notification: &Notification) {
        if let Ok(json) = serde_json::to_string(&serde_json::json!({ "kind": "notification", "notification": notification })) {
            let _ = self.tx.send(json);
        }
    }

    fn ping(&self, reason: &str) {
        let _ = self.tx.send(serde_json::json!({ "kind": "ping", "reason": reason }).to_string());
    }

    pub fn subscribe(&self) -> broadcast::Receiver<String> {
        self.tx.subscribe()
    }
}
