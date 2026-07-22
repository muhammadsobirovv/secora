use std::sync::Arc;

use crate::bridge::live::LiveSyncHub;
use crate::state::AppState;

/// Axum `State` extractor payload for every Bridge route — cheap to
/// `.clone()`, matching axum's expectation that `State<S>: Clone`.
/// `AppState` itself derives `Clone` (every field is already an `Arc<..>`
/// repository/service or a `sqlx::SqlitePool`, which is internally
/// `Arc`-backed) specifically so it can be cloned once here and handed to
/// the Bridge Server's Tokio tasks, which run outside Tauri's own
/// managed-state lifetime (`app.manage()`/`State<'_, AppState>` only
/// works for Tauri command handlers, not for a plain axum server spawned
/// alongside it) — see `lib.rs::run()`'s `setup()` closure, which clones
/// `AppState` once before handing the original to `handle.manage(..)`.
#[derive(Clone)]
pub struct BridgeState {
    pub app: AppState,
    pub token: Arc<str>,
    pub crypto_key: Arc<[u8; 32]>,
    pub live: Arc<LiveSyncHub>,
    /// App data dir (same root `evidence_commands::import_evidence` uses
    /// via `AppHandle::path()`), captured once at bridge startup since
    /// Tokio tasks outside a Tauri command handler have no `AppHandle`.
    pub data_dir: std::path::PathBuf,
}
