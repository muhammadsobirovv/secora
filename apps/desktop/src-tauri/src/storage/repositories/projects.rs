use serde::Serialize;
use sqlx::SqlitePool;

use crate::error::AppResult;

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRecord {
    pub id: String,
    pub remote_id: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    pub sync_status: String,
}

pub struct ProjectsRepository {
    pool: SqlitePool,
}

impl ProjectsRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn create(&self, id: &str, name: &str, description: Option<&str>) -> AppResult<ProjectRecord> {
        sqlx::query("INSERT INTO projects (id, name, description) VALUES (?1, ?2, ?3)")
            .bind(id)
            .bind(name)
            .bind(description)
            .execute(&self.pool)
            .await?;

        self.get(id).await?.ok_or_else(|| {
            crate::error::AppError::new("PROJECT_NOT_FOUND", "Project vanished immediately after insert.")
        })
    }

    pub async fn get(&self, id: &str) -> AppResult<Option<ProjectRecord>> {
        let row = sqlx::query_as::<_, ProjectRecord>(
            "SELECT id, remote_id, name, description, status, created_at, updated_at, sync_status
             FROM projects WHERE id = ?1 AND deleted_at IS NULL",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row)
    }

    pub async fn list(&self) -> AppResult<Vec<ProjectRecord>> {
        let rows = sqlx::query_as::<_, ProjectRecord>(
            "SELECT id, remote_id, name, description, status, created_at, updated_at, sync_status
             FROM projects WHERE deleted_at IS NULL ORDER BY updated_at DESC",
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    pub async fn soft_delete(&self, id: &str) -> AppResult<()> {
        sqlx::query("UPDATE projects SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}
