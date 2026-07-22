//! Tauri commands for Settings > Sync: mode selection, connecting to a
//! sync server, manual "Sync now", and the retry-queue/conflict views.

use tauri::State;

use crate::error::AppResult;
use crate::state::AppState;
use crate::sync::engine::SyncSummary;
use crate::sync::queue::RetryEntry;
use crate::sync::{SyncConfig, SyncMode};

#[tauri::command]
pub async fn get_sync_config(state: State<'_, AppState>) -> AppResult<SyncConfig> {
    Ok(state.sync.config().await)
}

#[tauri::command]
pub async fn set_sync_mode(state: State<'_, AppState>, mode: SyncMode) -> AppResult<()> {
    state.sync.set_mode(mode).await
}

#[tauri::command]
pub async fn set_sync_connection(state: State<'_, AppState>, api_base_url: String, token: String) -> AppResult<()> {
    state.sync.set_connection(&api_base_url, &token).await
}

#[tauri::command]
pub async fn disconnect_sync(state: State<'_, AppState>) -> AppResult<()> {
    state.sync.disconnect().await
}

#[tauri::command]
pub async fn set_sync_workspace(state: State<'_, AppState>, workspace_id: String) -> AppResult<()> {
    state.sync.set_workspace(&workspace_id).await
}

#[tauri::command]
pub async fn test_sync_connection(state: State<'_, AppState>) -> AppResult<()> {
    state.sync.test_connection().await
}

#[tauri::command]
pub async fn sync_now(state: State<'_, AppState>) -> AppResult<SyncSummary> {
    state.sync.sync_once().await
}

#[tauri::command]
pub async fn list_sync_retry_queue(state: State<'_, AppState>) -> AppResult<Vec<RetryEntry>> {
    state.sync.list_retry_queue().await
}

/// Conflicts are just rows with `sync_status = 'CONFLICT'` across the
/// pullable metadata tables — surfaced together so Settings > Sync can
/// show one "N conflicts need your attention" list.
#[tauri::command]
pub async fn list_sync_conflicts(state: State<'_, AppState>) -> AppResult<Vec<SyncConflict>> {
    let mut out = Vec::new();
    for entity in crate::sync::ENTITIES.iter().filter(|e| e.pullable) {
        let rows: Vec<(String, String)> = sqlx::query_as(&format!(
            "SELECT id, COALESCE(remote_id, '') FROM {} WHERE sync_status = 'CONFLICT'",
            entity.table
        ))
        .fetch_all(&state.db)
        .await?;
        for (id, remote_id) in rows {
            out.push(SyncConflict { entity_type: entity.entity_type.to_string(), id, remote_id });
        }
    }
    Ok(out)
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncConflict {
    pub entity_type: String,
    pub id: String,
    pub remote_id: String,
}

/// Resolves a conflict by keeping the local copy (marks it dirty again so
/// the next push cycle overwrites the server) or discarding local edits
/// (marks it SYNCED so the next pull's "already exists, not dirty" path
/// takes the remote version on the following cycle).
#[tauri::command]
pub async fn resolve_sync_conflict(state: State<'_, AppState>, entity_type: String, id: String, keep_local: bool) -> AppResult<()> {
    let Some(entity) = crate::sync::ENTITIES.iter().find(|e| e.entity_type == entity_type) else {
        return Err(crate::error::AppError::new("INVALID_ENTITY_TYPE", format!("Unknown sync entity \"{entity_type}\".")));
    };
    let new_status = if keep_local { "PENDING" } else { "SYNCED" };
    sqlx::query(&format!("UPDATE {} SET sync_status = ?1 WHERE id = ?2", entity.table))
        .bind(new_status)
        .bind(&id)
        .execute(&state.db)
        .await?;
    Ok(())
}
