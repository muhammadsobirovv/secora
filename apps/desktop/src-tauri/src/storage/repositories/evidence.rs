//! Evidence Library — imported files (screenshots, PCAPs, HAR exports,
//! request/response logs, PDFs, ...) with SHA-256-based duplicate
//! detection. Backs the File Manager (`commands::evidence_commands`).

use serde::Serialize;
use sqlx::SqlitePool;

use crate::error::AppResult;

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceRecord {
    pub id: String,
    pub remote_id: Option<String>,
    pub project_id: String,
    pub file_name: String,
    pub file_path: String,
    pub mime_type: Option<String>,
    pub size_bytes: Option<i64>,
    pub sha256: Option<String>,
    pub tags: String, // JSON array, kept as raw string here — callers parse/serialize as needed
    pub created_at: String,
    pub sync_status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateGroup {
    pub sha256: String,
    pub items: Vec<EvidenceRecord>,
}

pub struct EvidenceRepository {
    pool: SqlitePool,
}

impl EvidenceRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn create(
        &self,
        id: &str,
        project_id: &str,
        file_name: &str,
        file_path: &str,
        mime_type: Option<&str>,
        size_bytes: i64,
        sha256: &str,
        tags: &[String],
    ) -> AppResult<EvidenceRecord> {
        let tags_json = serde_json::to_string(tags).unwrap_or_else(|_| "[]".to_string());
        sqlx::query(
            "INSERT INTO evidence (id, project_id, file_name, file_path, mime_type, size_bytes, sha256, tags)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        )
        .bind(id)
        .bind(project_id)
        .bind(file_name)
        .bind(file_path)
        .bind(mime_type)
        .bind(size_bytes)
        .bind(sha256)
        .bind(&tags_json)
        .execute(&self.pool)
        .await?;

        self.get(id).await?.ok_or_else(|| crate::error::AppError::new("EVIDENCE_NOT_FOUND", "Evidence row vanished immediately after insert."))
    }

    pub async fn get(&self, id: &str) -> AppResult<Option<EvidenceRecord>> {
        let row = sqlx::query_as::<_, EvidenceRecord>(
            "SELECT id, remote_id, project_id, file_name, file_path, mime_type, size_bytes, sha256, tags, created_at, sync_status
             FROM evidence WHERE id = ?1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row)
    }

    pub async fn list(&self, project_id: &str) -> AppResult<Vec<EvidenceRecord>> {
        let rows = sqlx::query_as::<_, EvidenceRecord>(
            "SELECT id, remote_id, project_id, file_name, file_path, mime_type, size_bytes, sha256, tags, created_at, sync_status
             FROM evidence WHERE project_id = ?1 ORDER BY created_at DESC",
        )
        .bind(project_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    pub async fn find_by_sha256(&self, project_id: &str, sha256: &str) -> AppResult<Vec<EvidenceRecord>> {
        let rows = sqlx::query_as::<_, EvidenceRecord>(
            "SELECT id, remote_id, project_id, file_name, file_path, mime_type, size_bytes, sha256, tags, created_at, sync_status
             FROM evidence WHERE project_id = ?1 AND sha256 = ?2",
        )
        .bind(project_id)
        .bind(sha256)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    /// Groups every evidence item in the project by hash, keeping only
    /// groups with more than one member — i.e. actual duplicates.
    pub async fn find_duplicates(&self, project_id: &str) -> AppResult<Vec<DuplicateGroup>> {
        let all = self.list(project_id).await?;
        let mut by_hash: std::collections::HashMap<String, Vec<EvidenceRecord>> = std::collections::HashMap::new();
        for item in all {
            if let Some(hash) = item.sha256.clone() {
                by_hash.entry(hash).or_default().push(item);
            }
        }
        Ok(by_hash
            .into_iter()
            .filter(|(_, items)| items.len() > 1)
            .map(|(sha256, items)| DuplicateGroup { sha256, items })
            .collect())
    }

    pub async fn update_tags(&self, id: &str, tags: &[String]) -> AppResult<()> {
        let tags_json = serde_json::to_string(tags).unwrap_or_else(|_| "[]".to_string());
        sqlx::query("UPDATE evidence SET tags = ?1 WHERE id = ?2").bind(&tags_json).bind(id).execute(&self.pool).await?;
        Ok(())
    }

    pub async fn delete(&self, id: &str) -> AppResult<Option<String>> {
        let row: Option<(String,)> = sqlx::query_as("SELECT file_path FROM evidence WHERE id = ?1").bind(id).fetch_optional(&self.pool).await?;
        sqlx::query("DELETE FROM evidence WHERE id = ?1").bind(id).execute(&self.pool).await?;
        Ok(row.map(|(p,)| p))
    }
}
