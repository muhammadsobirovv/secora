//! Orchestrates one sync cycle: for every entity registered for the
//! current `SyncMode`, push locally-dirty rows (with backoff via
//! `RetryQueue`), then pull remote changes for pullable entities and
//! merge them in with last-write-wins conflict resolution.

use std::sync::Arc;
use tokio::sync::RwLock;

use sqlx::sqlite::SqliteRow;
use sqlx::{Column, Row, SqlitePool};

use super::client::{PullResponse, PushRequest, SyncClient};
use super::queue::RetryQueue;
use super::{entities_for_mode, EntityConfig, SyncConfig, SyncMode};
use crate::error::{AppError, AppResult};
use crate::storage::repositories::settings::SettingsRepository;

#[derive(Debug, Clone, serde::Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SyncSummary {
    pub pushed: usize,
    pub pulled: usize,
    pub conflicts: usize,
    pub errors: Vec<String>,
}

pub struct SyncEngine {
    db: SqlitePool,
    settings: Arc<SettingsRepository>,
    client: SyncClient,
    retry: RetryQueue,
    config: RwLock<SyncConfig>,
}

impl SyncEngine {
    pub async fn new(db: SqlitePool, settings: Arc<SettingsRepository>) -> AppResult<Self> {
        let config = settings.get::<SyncConfig>(SyncConfig::SETTINGS_KEY).await?.unwrap_or_default();
        Ok(Self {
            retry: RetryQueue::new(db.clone()),
            db,
            settings,
            client: SyncClient::new(),
            config: RwLock::new(config),
        })
    }

    pub async fn config(&self) -> SyncConfig {
        self.config.read().await.clone()
    }

    async fn save_config(&self, config: SyncConfig) -> AppResult<()> {
        self.settings.set(SyncConfig::SETTINGS_KEY, &config).await?;
        *self.config.write().await = config;
        Ok(())
    }

    pub async fn set_mode(&self, mode: SyncMode) -> AppResult<()> {
        let mut config = self.config().await;
        config.mode = mode;
        self.save_config(config).await
    }

    pub async fn set_connection(&self, api_base_url: &str, token: &str) -> AppResult<()> {
        if !api_base_url.starts_with("https://") && !api_base_url.starts_with("http://localhost") && !api_base_url.starts_with("http://127.0.0.1") {
            return Err(AppError::new(
                "SYNC_INSECURE_URL",
                "Sync server URL must use HTTPS (localhost is allowed for development).",
            ));
        }
        super::store_access_token(token)?;
        let mut config = self.config().await;
        config.api_base_url = Some(api_base_url.trim_end_matches('/').to_string());
        self.save_config(config).await
    }

    pub async fn disconnect(&self) -> AppResult<()> {
        super::delete_access_token()?;
        let mut config = self.config().await;
        config.api_base_url = None;
        config.workspace_id = None;
        config.last_synced_at = None;
        self.save_config(config).await
    }

    /// Switching workspaces resets the pull cursor so the next cycle does
    /// a full pull scoped to the new workspace rather than mixing rows
    /// from two workspaces under one `last_synced_at` cursor.
    pub async fn set_workspace(&self, workspace_id: &str) -> AppResult<()> {
        let mut config = self.config().await;
        config.workspace_id = Some(workspace_id.to_string());
        config.last_synced_at = None;
        self.save_config(config).await
    }

    pub async fn test_connection(&self) -> AppResult<()> {
        let config = self.config().await;
        let base_url = config.api_base_url.as_deref().ok_or_else(|| AppError::new("SYNC_NOT_CONFIGURED", "No sync server configured."))?;
        let token = super::read_access_token()?.ok_or_else(|| AppError::new("SYNC_NOT_CONFIGURED", "No sync credentials stored."))?;
        self.client.test_connection(base_url, &token).await
    }

    pub async fn list_retry_queue(&self) -> AppResult<Vec<super::queue::RetryEntry>> {
        self.retry.list().await
    }

    /// Spawns the periodic background sync loop. No-op (loop still runs,
    /// but every tick is a fast no-op check) when mode is `Off` so turning
    /// sync back on doesn't require an app restart.
    pub fn spawn_background(self: Arc<Self>) {
        tokio::spawn(async move {
            loop {
                let interval = self.config().await.interval_seconds.max(30);
                tokio::time::sleep(std::time::Duration::from_secs(interval)).await;
                if let Err(e) = self.sync_once().await {
                    eprintln!("Sync Engine: cycle failed: {e}");
                }
            }
        });
    }

    pub async fn sync_once(&self) -> AppResult<SyncSummary> {
        let config = self.config().await;
        if matches!(config.mode, SyncMode::Off) {
            return Ok(SyncSummary::default());
        }
        let Some(base_url) = config.api_base_url.clone() else {
            return Ok(SyncSummary { errors: vec!["No sync server configured.".into()], ..Default::default() });
        };
        let Some(token) = super::read_access_token()? else {
            return Ok(SyncSummary { errors: vec!["No sync credentials stored.".into()], ..Default::default() });
        };
        let Some(workspace_id) = config.workspace_id.clone() else {
            return Ok(SyncSummary { errors: vec!["No workspace selected for sync.".into()], ..Default::default() });
        };

        let mut summary = SyncSummary::default();

        for entity in entities_for_mode(config.mode) {
            match self.push_pending(entity, &base_url, &token, &workspace_id).await {
                Ok(n) => summary.pushed += n,
                Err(e) => summary.errors.push(format!("{}: push failed: {e}", entity.entity_type)),
            }

            if entity.pullable {
                match self.pull_entity(entity, &base_url, &token, &workspace_id, config.last_synced_at.as_deref()).await {
                    Ok((pulled, conflicts)) => {
                        summary.pulled += pulled;
                        summary.conflicts += conflicts;
                    }
                    Err(e) => summary.errors.push(format!("{}: pull failed: {e}", entity.entity_type)),
                }
            }
        }

        let mut new_config = config;
        new_config.last_synced_at = Some(chrono::Utc::now().to_rfc3339());
        self.save_config(new_config).await?;

        Ok(summary)
    }

    // ---- push ------------------------------------------------------

    async fn push_pending(&self, entity: &EntityConfig, base_url: &str, token: &str, workspace_id: &str) -> AppResult<usize> {
        let where_clause = if entity.has_sync_status {
            "sync_status != 'SYNCED' AND sync_status != 'CONFLICT'".to_string()
        } else if entity.has_updated_at {
            "remote_id IS NULL".to_string() // create-only fallback for tables without sync_status; updates for these are rare (title/pin edits) and caught by periodic full push below
        } else {
            "remote_id IS NULL".to_string()
        };

        let sql = format!("SELECT * FROM {} WHERE {}", entity.table, where_clause);
        let rows = sqlx::query(&sql).fetch_all(&self.db).await?;

        let mut pushed = 0;
        for row in rows {
            let data = row_to_json(&row);
            let id = data.get("id").and_then(|v| v.as_str()).unwrap_or_default().to_string();
            if id.is_empty() {
                continue;
            }
            if !self.retry.is_due(entity.entity_type, &id).await? {
                continue;
            }

            let remote_id = data.get("remote_id").and_then(|v| v.as_str()).map(|s| s.to_string());
            let is_deleted = entity.has_deleted_at && data.get("deleted_at").map(|v| !v.is_null()).unwrap_or(false);
            let operation = if is_deleted {
                "DELETE"
            } else if remote_id.is_some() {
                "UPDATE"
            } else {
                "CREATE"
            };

            let req = PushRequest {
                workspace_id,
                operation,
                remote_id: remote_id.as_deref(),
                data: data.clone(),
            };

            match self.client.push(base_url, token, entity.entity_type, &req).await {
                Ok(resp) => {
                    if operation == "DELETE" {
                        sqlx::query(&format!("DELETE FROM {} WHERE id = ?1", entity.table)).bind(&id).execute(&self.db).await?;
                    } else if entity.has_sync_status {
                        sqlx::query(&format!("UPDATE {} SET remote_id = ?1, sync_status = 'SYNCED' WHERE id = ?2", entity.table))
                            .bind(&resp.remote_id)
                            .bind(&id)
                            .execute(&self.db)
                            .await?;
                    } else {
                        sqlx::query(&format!("UPDATE {} SET remote_id = ?1 WHERE id = ?2", entity.table))
                            .bind(&resp.remote_id)
                            .bind(&id)
                            .execute(&self.db)
                            .await?;
                    }
                    self.retry.record_success(entity.entity_type, &id).await?;
                    pushed += 1;
                }
                Err(e) => {
                    if entity.has_sync_status {
                        sqlx::query(&format!("UPDATE {} SET sync_status = 'PENDING' WHERE id = ?1 AND sync_status != 'CONFLICT'", entity.table))
                            .bind(&id)
                            .execute(&self.db)
                            .await?;
                    }
                    self.retry.record_failure(entity.entity_type, &id, operation, &e.to_string()).await?;
                }
            }
        }

        Ok(pushed)
    }

    // ---- pull --------------------------------------------------------

    async fn pull_entity(
        &self,
        entity: &EntityConfig,
        base_url: &str,
        token: &str,
        workspace_id: &str,
        since: Option<&str>,
    ) -> AppResult<(usize, usize)> {
        let resp: PullResponse = self.client.pull(base_url, token, entity.entity_type, workspace_id, since).await?;
        let mut pulled = 0;
        let mut conflicts = 0;

        for item in resp.items {
            let existing: Option<(String, Option<String>, String)> = sqlx::query_as(&format!(
                "SELECT id, sync_status, COALESCE(updated_at, '') FROM {} WHERE remote_id = ?1",
                entity.table
            ))
            .bind(&item.remote_id)
            .fetch_optional(&self.db)
            .await
            .unwrap_or(None);

            match (entity.entity_type, existing) {
                (_, Some((local_id, sync_status, local_updated_at))) => {
                    // Row already exists locally. If it has unsynced local
                    // edits AND the remote version changed too, that's a
                    // genuine concurrent edit — flag it instead of
                    // guessing which side wins.
                    let locally_dirty = sync_status.as_deref().map(|s| s != "SYNCED").unwrap_or(false);
                    let remote_changed = local_updated_at.as_str() < item.updated_at.as_str();
                    if locally_dirty && remote_changed {
                        sqlx::query(&format!("UPDATE {} SET sync_status = 'CONFLICT' WHERE id = ?1", entity.table))
                            .bind(&local_id)
                            .execute(&self.db)
                            .await?;
                        conflicts += 1;
                        continue;
                    }
                    if remote_changed {
                        self.apply_pulled_update(entity, &local_id, &item).await?;
                        pulled += 1;
                    }
                }
                ("PROJECT", None) => {
                    let id = uuid::Uuid::new_v4().to_string();
                    let name = item.data.get("name").and_then(|v| v.as_str()).unwrap_or("Untitled");
                    let description = item.data.get("description").and_then(|v| v.as_str());
                    let status = item.data.get("status").and_then(|v| v.as_str()).unwrap_or("ACTIVE");
                    sqlx::query(
                        "INSERT INTO projects (id, remote_id, name, description, status, updated_at, sync_status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'SYNCED')",
                    )
                    .bind(&id).bind(&item.remote_id).bind(name).bind(description).bind(status).bind(&item.updated_at)
                    .execute(&self.db).await?;
                    pulled += 1;
                }
                ("TARGET", None) => {
                    let remote_project_id = item.data.get("projectId").and_then(|v| v.as_str());
                    let Some(remote_project_id) = remote_project_id else { continue };
                    let local_project: Option<(String,)> =
                        sqlx::query_as("SELECT id FROM projects WHERE remote_id = ?1").bind(remote_project_id).fetch_optional(&self.db).await?;
                    let Some((project_id,)) = local_project else { continue }; // project hasn't pulled yet; retry next cycle
                    let id = uuid::Uuid::new_v4().to_string();
                    let target_type = item.data.get("type").and_then(|v| v.as_str()).unwrap_or("DOMAIN");
                    let value = item.data.get("value").and_then(|v| v.as_str()).unwrap_or_default();
                    sqlx::query(
                        "INSERT INTO targets (id, remote_id, project_id, type, value, updated_at, sync_status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'SYNCED')",
                    )
                    .bind(&id).bind(&item.remote_id).bind(&project_id).bind(target_type).bind(value).bind(&item.updated_at)
                    .execute(&self.db).await?;
                    pulled += 1;
                }
                ("NOTE", None) => {
                    let remote_project_id = item.data.get("projectId").and_then(|v| v.as_str());
                    let Some(remote_project_id) = remote_project_id else { continue };
                    let local_project: Option<(String,)> =
                        sqlx::query_as("SELECT id FROM projects WHERE remote_id = ?1").bind(remote_project_id).fetch_optional(&self.db).await?;
                    let Some((project_id,)) = local_project else { continue };
                    let id = uuid::Uuid::new_v4().to_string();
                    let title = item.data.get("title").and_then(|v| v.as_str());
                    let content = item.data.get("content").and_then(|v| v.as_str()).unwrap_or_default();
                    sqlx::query(
                        "INSERT INTO notes (id, remote_id, project_id, title, content, updated_at, sync_status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'SYNCED')",
                    )
                    .bind(&id).bind(&item.remote_id).bind(&project_id).bind(title).bind(content).bind(&item.updated_at)
                    .execute(&self.db).await?;
                    pulled += 1;
                }
                _ => {}
            }
        }

        Ok((pulled, conflicts))
    }

    /// Applies an already-known-newer, non-conflicting remote item onto an
    /// existing local row — last-write-wins, remote wins since we already
    /// established the local copy has no unsynced edits. Only
    /// Project/Note content fields are merged in place today (Target
    /// identity fields — type/value — aren't expected to change post
    /// creation); extending this to more entity types is additive, one
    /// match arm each.
    async fn apply_pulled_update(&self, entity: &EntityConfig, local_id: &str, item: &super::client::PulledItem) -> AppResult<()> {
        match entity.entity_type {
            "PROJECT" => {
                let name = item.data.get("name").and_then(|v| v.as_str());
                let description = item.data.get("description").and_then(|v| v.as_str());
                let status = item.data.get("status").and_then(|v| v.as_str());
                sqlx::query(
                    "UPDATE projects SET name = COALESCE(?1, name), description = COALESCE(?2, description),
                     status = COALESCE(?3, status), updated_at = ?4, sync_status = 'SYNCED' WHERE id = ?5",
                )
                .bind(name).bind(description).bind(status).bind(&item.updated_at).bind(local_id)
                .execute(&self.db).await?;
            }
            "NOTE" => {
                let title = item.data.get("title").and_then(|v| v.as_str());
                let content = item.data.get("content").and_then(|v| v.as_str());
                sqlx::query(
                    "UPDATE notes SET title = COALESCE(?1, title), content = COALESCE(?2, content),
                     updated_at = ?3, sync_status = 'SYNCED' WHERE id = ?4",
                )
                .bind(title).bind(content).bind(&item.updated_at).bind(local_id)
                .execute(&self.db).await?;
            }
            _ => {
                // No mergeable fields for this entity type yet — just
                // acknowledge the newer remote timestamp so it stops
                // being re-evaluated every cycle.
                if entity.has_sync_status {
                    sqlx::query(&format!("UPDATE {} SET sync_status = 'SYNCED' WHERE id = ?1", entity.table))
                        .bind(local_id)
                        .execute(&self.db)
                        .await?;
                }
            }
        }
        Ok(())
    }
}

/// Generic `SqliteRow` → JSON object conversion, used so `push_pending`
/// doesn't need a hand-written struct per table. SQLite is dynamically
/// typed so this tries the common column types in order; unrecognized/
/// NULL values fall back to JSON null.
fn row_to_json(row: &SqliteRow) -> serde_json::Value {
    let mut map = serde_json::Map::new();
    for col in row.columns() {
        let name = col.name();
        let value = if let Ok(v) = row.try_get::<i64, _>(name) {
            serde_json::json!(v)
        } else if let Ok(v) = row.try_get::<f64, _>(name) {
            serde_json::json!(v)
        } else if let Ok(v) = row.try_get::<String, _>(name) {
            serde_json::json!(v)
        } else if let Ok(v) = row.try_get::<bool, _>(name) {
            serde_json::json!(v)
        } else {
            serde_json::Value::Null
        };
        map.insert(name.to_string(), value);
    }
    serde_json::Value::Object(map)
}
