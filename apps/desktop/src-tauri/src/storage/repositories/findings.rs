//! Findings — created primarily by the Module 8 Burp Suite Extension
//! ("Create Finding") and Browser Extension (AI Analysis / recon
//! shortcuts flagging something interesting), but also usable from the
//! desktop UI directly. Mirrors `notes.rs`/`evidence.rs`'s repository
//! shape (soft delete, `sync_status`, camelCase DTO) for consistency.

use serde::Serialize;
use sqlx::SqlitePool;

use crate::error::AppResult;

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct FindingRecord {
    pub id: String,
    pub remote_id: Option<String>,
    pub project_id: String,
    pub target_id: Option<String>,
    pub title: String,
    pub severity: String,
    pub status: String,
    pub source: String,
    pub url: Option<String>,
    pub description: Option<String>,
    pub evidence: Option<String>,
    #[sqlx(json)]
    pub tags: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
    pub sync_status: String,
}

/// `severity` should be one of CRITICAL/HIGH/MEDIUM/LOW/INFO and `source`
/// one of MANUAL/BURP/BROWSER_EXTENSION/AI — enforced at the call site
/// (bridge routes / Tauri commands), not with a SQL CHECK constraint, so a
/// future new source doesn't require a migration.
pub struct NewFinding<'a> {
    pub project_id: &'a str,
    pub target_id: Option<&'a str>,
    pub title: &'a str,
    pub severity: &'a str,
    pub source: &'a str,
    pub url: Option<&'a str>,
    pub description: Option<&'a str>,
    pub evidence: Option<&'a str>,
    pub tags: &'a [String],
}

pub struct FindingsRepository {
    pool: SqlitePool,
}

impl FindingsRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn create(&self, id: &str, new: NewFinding<'_>) -> AppResult<FindingRecord> {
        let tags_json = serde_json::to_string(new.tags).unwrap_or_else(|_| "[]".to_string());
        sqlx::query(
            "INSERT INTO findings (id, project_id, target_id, title, severity, source, url, description, evidence, tags)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        )
        .bind(id)
        .bind(new.project_id)
        .bind(new.target_id)
        .bind(new.title)
        .bind(new.severity)
        .bind(new.source)
        .bind(new.url)
        .bind(new.description)
        .bind(new.evidence)
        .bind(tags_json)
        .execute(&self.pool)
        .await?;

        self.get(id).await?.ok_or_else(|| crate::error::AppError::new("FINDING_NOT_FOUND", "Finding vanished immediately after insert."))
    }

    pub async fn get(&self, id: &str) -> AppResult<Option<FindingRecord>> {
        let row = sqlx::query_as::<_, FindingRecord>(
            "SELECT id, remote_id, project_id, target_id, title, severity, status, source, url, description, evidence, tags, created_at, updated_at, sync_status
             FROM findings WHERE id = ?1 AND deleted_at IS NULL",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row)
    }

    pub async fn list(&self, project_id: &str) -> AppResult<Vec<FindingRecord>> {
        let rows = sqlx::query_as::<_, FindingRecord>(
            "SELECT id, remote_id, project_id, target_id, title, severity, status, source, url, description, evidence, tags, created_at, updated_at, sync_status
             FROM findings WHERE project_id = ?1 AND deleted_at IS NULL ORDER BY created_at DESC",
        )
        .bind(project_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    pub async fn update_status(&self, id: &str, status: &str) -> AppResult<FindingRecord> {
        sqlx::query("UPDATE findings SET status = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), sync_status = CASE WHEN sync_status = 'SYNCED' THEN 'PENDING_PUSH' ELSE sync_status END WHERE id = ?1")
            .bind(id)
            .bind(status)
            .execute(&self.pool)
            .await?;
        self.get(id).await?.ok_or_else(|| crate::error::AppError::new("FINDING_NOT_FOUND", format!("Finding \"{id}\" not found.")))
    }

    pub async fn delete(&self, id: &str) -> AppResult<()> {
        sqlx::query("UPDATE findings SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1").bind(id).execute(&self.pool).await?;
        Ok(())
    }
}
