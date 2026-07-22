//! Payload Library persistence — table predates this repository
//! (`migrations/0002_payloads.sql`, added for Local RAG indexing, see
//! `rag::indexer::reindex_all`'s `payloads` query). This is the first
//! CRUD-shaped access on top of it, added for Module 8's Bridge Server
//! `/api/payloads` route so the Browser Extension's "Custom Payloads"
//! category can persist and sync across desktop + extension (the other
//! twelve built-in categories — XSS/SQLi/SSRF/XXE/LFI/RFI/Open Redirect/
//! JWT/SSTI/GraphQL/Command Injection/Template Injection — ship as a
//! static bundled list in the extension itself, see
//! `apps/browser-extension/shared/payloads.ts`, so quick-insert works
//! even when the Desktop Agent isn't running; only user-authored custom
//! ones need a durable store).

use serde::Serialize;
use sqlx::SqlitePool;

use crate::error::AppResult;

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct PayloadRecord {
    pub id: String,
    pub remote_id: Option<String>,
    pub category: String,
    pub title: String,
    pub description: Option<String>,
    pub example: String,
    #[sqlx(json)]
    pub tags: Vec<String>,
    pub created_at: String,
    pub sync_status: String,
}

pub struct PayloadsRepository {
    pool: SqlitePool,
}

impl PayloadsRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn create(&self, id: &str, category: &str, title: &str, description: Option<&str>, example: &str, tags: &[String]) -> AppResult<PayloadRecord> {
        let tags_json = serde_json::to_string(tags).unwrap_or_else(|_| "[]".to_string());
        sqlx::query("INSERT INTO payloads (id, category, title, description, example, tags) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
            .bind(id)
            .bind(category)
            .bind(title)
            .bind(description)
            .bind(example)
            .bind(tags_json)
            .execute(&self.pool)
            .await?;
        self.get(id).await?.ok_or_else(|| crate::error::AppError::new("PAYLOAD_NOT_FOUND", "Payload vanished immediately after insert."))
    }

    pub async fn get(&self, id: &str) -> AppResult<Option<PayloadRecord>> {
        let row = sqlx::query_as::<_, PayloadRecord>("SELECT id, remote_id, category, title, description, example, tags, created_at, sync_status FROM payloads WHERE id = ?1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await?;
        Ok(row)
    }

    pub async fn list(&self, category: Option<&str>) -> AppResult<Vec<PayloadRecord>> {
        let rows = if let Some(category) = category {
            sqlx::query_as::<_, PayloadRecord>("SELECT id, remote_id, category, title, description, example, tags, created_at, sync_status FROM payloads WHERE category = ?1 ORDER BY created_at DESC")
                .bind(category)
                .fetch_all(&self.pool)
                .await?
        } else {
            sqlx::query_as::<_, PayloadRecord>("SELECT id, remote_id, category, title, description, example, tags, created_at, sync_status FROM payloads ORDER BY created_at DESC")
                .fetch_all(&self.pool)
                .await?
        };
        Ok(rows)
    }

    pub async fn delete(&self, id: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM payloads WHERE id = ?1").bind(id).execute(&self.pool).await?;
        Ok(())
    }
}
