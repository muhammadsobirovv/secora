use async_trait::async_trait;
use serde::Serialize;
use sqlx::SqlitePool;

use crate::error::AppResult;
use crate::queue::{ResolvedTarget, TargetResolver};
use crate::services::tool_runner::TargetType;

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TargetRecord {
    pub id: String,
    pub remote_id: Option<String>,
    pub project_id: String,
    #[sqlx(rename = "type")]
    #[serde(rename = "type")]
    pub target_type: String,
    pub value: String,
    pub created_at: String,
    pub sync_status: String,
}

pub struct TargetsRepository {
    pool: SqlitePool,
}

impl TargetsRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn create(&self, id: &str, project_id: &str, target_type: &str, value: &str) -> AppResult<TargetRecord> {
        sqlx::query("INSERT INTO targets (id, project_id, type, value) VALUES (?1, ?2, ?3, ?4)")
            .bind(id)
            .bind(project_id)
            .bind(target_type)
            .bind(value)
            .execute(&self.pool)
            .await?;
        self.get(id).await?.ok_or_else(|| {
            crate::error::AppError::new("TARGET_NOT_FOUND", "Target vanished immediately after insert.")
        })
    }

    pub async fn get(&self, id: &str) -> AppResult<Option<TargetRecord>> {
        let row = sqlx::query_as::<_, TargetRecord>(
            "SELECT id, remote_id, project_id, type, value, created_at, sync_status
             FROM targets WHERE id = ?1 AND deleted_at IS NULL",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row)
    }

    pub async fn list_by_project(&self, project_id: &str) -> AppResult<Vec<TargetRecord>> {
        let rows = sqlx::query_as::<_, TargetRecord>(
            "SELECT id, remote_id, project_id, type, value, created_at, sync_status
             FROM targets WHERE project_id = ?1 AND deleted_at IS NULL ORDER BY created_at DESC",
        )
        .bind(project_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }
}

fn parse_target_type(s: &str) -> TargetType {
    match s {
        "SUBDOMAIN" => TargetType::Subdomain,
        "IP_ADDRESS" => TargetType::IpAddress,
        "CIDR" => TargetType::Cidr,
        "URL" => TargetType::Url,
        _ => TargetType::Domain,
    }
}

#[async_trait]
impl TargetResolver for TargetsRepository {
    async fn resolve(&self, target_id: &str) -> AppResult<ResolvedTarget> {
        let record = self.get(target_id).await?.ok_or_else(|| {
            crate::error::AppError::new("TARGET_NOT_FOUND", format!("Target \"{target_id}\" not found."))
        })?;
        Ok(ResolvedTarget {
            target_type: parse_target_type(&record.target_type),
            value: record.value,
        })
    }
}
