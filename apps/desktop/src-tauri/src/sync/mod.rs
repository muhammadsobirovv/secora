//! Sync Engine — keeps the local SQLite database (the desktop's source of
//! truth, per ADR 0007 "Local-First Desktop Agent Architecture") loosely
//! consistent with the backend across devices/workspaces.
//!
//! Design summary:
//! - **Push is table-driven, not enqueue-driven.** Rather than requiring
//!   every repository write-path across the whole app to remember to call
//!   `enqueue()`, `sync_once()` scans each registered table for rows whose
//!   `sync_status` isn't `SYNCED` and pushes them. This is self-healing —
//!   a crash between a local write and a queue write can't silently drop a
//!   change — at the cost of a periodic `SELECT ... WHERE sync_status !=
//!   'SYNCED'` per table, which is cheap at desktop data volumes.
//! - **`offline_queue` is retry/backoff bookkeeping, not the work queue
//!   itself.** One row per `(entity_type, entity_id)` currently failing to
//!   push, holding `attempt` (for exponential backoff) and `last_error`
//!   (surfaced in Settings > Sync). Deleted as soon as a push succeeds.
//! - **Pull is entity-specific.** Projects/Targets/Notes are edited from
//!   the desktop and may also be edited on other devices/the web app, so
//!   they're pulled and merged. Recon/scan findings, evidence, reports,
//!   and AI chat history are *produced* by this desktop (the whole point
//!   of the local-first migration was moving tool execution off the
//!   backend) — they're pushed up for cross-device visibility but never
//!   pulled back down, so no pull handler is needed for them.
//! - **Conflict resolution is last-write-wins by `updated_at`,
//!   with a `CONFLICT` escape hatch.** If a pull discovers the remote
//!   version is newer than what's local *and* the local row has
//!   unsynced edits, the row is marked `sync_status = 'CONFLICT'` instead
//!   of being silently overwritten, and surfaced via `list_sync_conflicts`
//!   for the user to resolve (keep mine / take theirs) rather than
//!   guessing.
//! - **Encryption.** All requests go over HTTPS (`reqwest` negotiates TLS
//!   for any `https://` base URL — the only base URL Settings > Sync
//!   accepts, see `commands::sync_commands::set_sync_config`). The bearer
//!   token is never written to SQLite; it lives in the OS keychain
//!   (`keyring`, same mechanism as `ai::credentials`), so "encrypted
//!   synchronization" covers both transport (TLS) and the credential
//!   needed to use it (OS-encrypted keychain).
//! - **Multi-workspace.** Every push/pull call carries `workspace_id`;
//!   switching the active workspace (`set_active_workspace`) resets
//!   `last_synced_at` to force a fresh metadata pull scoped to the new
//!   workspace rather than mixing rows across workspaces.

pub mod client;
pub mod engine;
pub mod queue;

pub use engine::SyncEngine;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SyncMode {
    /// No network calls at all. Default — the desktop app is fully usable
    /// with zero backend connectivity.
    Off,
    /// Sync Projects/Targets/Notes/Payloads only (small, text-only rows) —
    /// enough for the web app to show "what's this desktop working on"
    /// without shipping every recon finding/evidence file over the wire.
    MetadataOnly,
    /// Sync everything: metadata tier + findings, evidence metadata,
    /// reports, and AI conversation history.
    Everything,
}

impl SyncMode {
    pub fn as_str(&self) -> &'static str {
        match self {
            SyncMode::Off => "OFF",
            SyncMode::MetadataOnly => "METADATA_ONLY",
            SyncMode::Everything => "EVERYTHING",
        }
    }
}

impl Default for SyncMode {
    fn default() -> Self {
        SyncMode::Off
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncConfig {
    pub mode: SyncMode,
    pub api_base_url: Option<String>,
    pub workspace_id: Option<String>,
    /// Cursor for incremental pulls — server rows with `updatedAt >
    /// last_synced_at` are returned; `None` means "full pull" (first sync,
    /// or right after switching workspace/mode).
    pub last_synced_at: Option<String>,
    pub interval_seconds: u64,
}

impl SyncConfig {
    pub const SETTINGS_KEY: &'static str = "sync.config";
}

/// One row/table this engine knows how to sync. `tier` gates whether it
/// participates in `MetadataOnly` mode; everything participates in
/// `Everything` mode. `has_updated_at`/`has_deleted_at` describe the
/// table's actual columns (see `migrations/0001_init.sql`) since not every
/// table carries both (append-only tables like `recon_results` have
/// neither — they're immutable once created, so "sync" for them is just
/// "push once").
#[derive(Debug, Clone, Copy)]
pub struct EntityConfig {
    pub entity_type: &'static str,
    pub table: &'static str,
    pub tier: SyncTier,
    pub has_updated_at: bool,
    pub has_deleted_at: bool,
    /// Whether this table has a `sync_status` column at all — every table
    /// except `ai_conversations` does (see `migrations/0001_init.sql`);
    /// where it's absent, "needs push" falls back to `remote_id IS NULL OR
    /// updated_at > last_synced_at`.
    pub has_sync_status: bool,
    /// Whether a pull handler exists for this entity (see module doc).
    pub pullable: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SyncTier {
    Metadata,
    EverythingOnly,
}

pub const ENTITIES: &[EntityConfig] = &[
    EntityConfig { entity_type: "PROJECT", table: "projects", tier: SyncTier::Metadata, has_updated_at: true, has_deleted_at: true, has_sync_status: true, pullable: true },
    EntityConfig { entity_type: "TARGET", table: "targets", tier: SyncTier::Metadata, has_updated_at: true, has_deleted_at: true, has_sync_status: true, pullable: true },
    EntityConfig { entity_type: "NOTE", table: "notes", tier: SyncTier::Metadata, has_updated_at: true, has_deleted_at: true, has_sync_status: true, pullable: true },
    EntityConfig { entity_type: "PAYLOAD", table: "payloads", tier: SyncTier::Metadata, has_updated_at: false, has_deleted_at: false, has_sync_status: true, pullable: false },
    EntityConfig { entity_type: "RECON_FINDING", table: "recon_results", tier: SyncTier::EverythingOnly, has_updated_at: false, has_deleted_at: false, has_sync_status: true, pullable: false },
    EntityConfig { entity_type: "SCAN_FINDING", table: "scan_results", tier: SyncTier::EverythingOnly, has_updated_at: false, has_deleted_at: false, has_sync_status: true, pullable: false },
    EntityConfig { entity_type: "EVIDENCE", table: "evidence", tier: SyncTier::EverythingOnly, has_updated_at: false, has_deleted_at: false, has_sync_status: true, pullable: false },
    EntityConfig { entity_type: "REPORT", table: "reports", tier: SyncTier::EverythingOnly, has_updated_at: false, has_deleted_at: false, has_sync_status: true, pullable: false },
    EntityConfig { entity_type: "AI_CONVERSATION", table: "ai_conversations", tier: SyncTier::EverythingOnly, has_updated_at: true, has_deleted_at: false, has_sync_status: false, pullable: false },
    // Module 8's `findings` table (migrations/0003_findings.sql — Burp/
    // Browser-Extension-captured findings) has always had the right shape
    // to participate here (remote_id/updated_at/deleted_at/sync_status,
    // same as TARGET/NOTE) but was never actually registered — a gap
    // caught during Module 9's offline-support verification pass, not a
    // new column/table. Registered as Metadata tier (small, human-authored
    // rows, same reasoning as NOTE) rather than EverythingOnly.
    EntityConfig { entity_type: "FINDING", table: "findings", tier: SyncTier::Metadata, has_updated_at: true, has_deleted_at: true, has_sync_status: true, pullable: true },
];

pub fn entities_for_mode(mode: SyncMode) -> impl Iterator<Item = &'static EntityConfig> {
    ENTITIES.iter().filter(move |e| mode == SyncMode::Everything || e.tier == SyncTier::Metadata)
}

const KEYCHAIN_SERVICE: &str = "sync.pentesthub.desktop";
const KEYCHAIN_ACCOUNT: &str = "access_token";

pub fn store_access_token(token: &str) -> crate::error::AppResult<()> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT)
        .map_err(|e| crate::error::AppError::new("KEYRING_ERROR", e.to_string()))?;
    entry.set_password(token).map_err(|e| crate::error::AppError::new("KEYRING_ERROR", e.to_string()))
}

pub fn read_access_token() -> crate::error::AppResult<Option<String>> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT)
        .map_err(|e| crate::error::AppError::new("KEYRING_ERROR", e.to_string()))?;
    match entry.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(crate::error::AppError::new("KEYRING_ERROR", e.to_string())),
    }
}

pub fn delete_access_token() -> crate::error::AppResult<()> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT)
        .map_err(|e| crate::error::AppError::new("KEYRING_ERROR", e.to_string()))?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(crate::error::AppError::new("KEYRING_ERROR", e.to_string())),
    }
}
