//! Generated report metadata — the actual file lives on disk
//! (`file_path`), this table just indexes it (title/format/created_at) so
//! the Reports page can list/search/re-download past exports without
//! re-generating them.

use serde::Serialize;
use sqlx::SqlitePool;

use crate::error::AppResult;

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ReportRecord {
    pub id: String,
    pub remote_id: Option<String>,
    pub project_id: String,
    pub title: String,
    pub format: String,
    pub file_path: Option<String>,
    pub content: Option<String>,
    pub created_at: String,
    pub sync_status: String,
}

pub struct ReportsRepository {
    pool: SqlitePool,
}

impl ReportsRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn create(&self, id: &str, project_id: &str, title: &str, format: &str, file_path: &str, content: Option<&str>) -> AppResult<ReportRecord> {
        sqlx::query("INSERT INTO reports (id, project_id, title, format, file_path, content) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
            .bind(id)
            .bind(project_id)
            .bind(title)
            .bind(format)
            .bind(file_path)
            .bind(content)
            .execute(&self.pool)
            .await?;
        self.get(id).await?.ok_or_else(|| crate::error::AppError::new("REPORT_NOT_FOUND", "Report vanished immediately after insert."))
    }

    pub async fn get(&self, id: &str) -> AppResult<Option<ReportRecord>> {
        let row = sqlx::query_as::<_, ReportRecord>(
            "SELECT id, remote_id, project_id, title, format, file_path, content, created_at, sync_status FROM reports WHERE id = ?1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row)
    }

    pub async fn list(&self, project_id: &str) -> AppResult<Vec<ReportRecord>> {
        let rows = sqlx::query_as::<_, ReportRecord>(
            "SELECT id, remote_id, project_id, title, format, file_path, content, created_at, sync_status
             FROM reports WHERE project_id = ?1 ORDER BY created_at DESC",
        )
        .bind(project_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    pub async fn delete(&self, id: &str) -> AppResult<Option<String>> {
        let row: Option<(Option<String>,)> = sqlx::query_as("SELECT file_path FROM reports WHERE id = ?1").bind(id).fetch_optional(&self.pool).await?;
        sqlx::query("DELETE FROM reports WHERE id = ?1").bind(id).execute(&self.pool).await?;
        Ok(row.and_then(|(p,)| p))
    }
}
