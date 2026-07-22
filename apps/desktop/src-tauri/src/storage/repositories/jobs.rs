//! Persistence for the Background Job Queue (`queue::JobQueue`). A plain
//! struct wrapping a `SqlitePool` — no repository *interface* here (unlike
//! the backend's ports-and-adapters split) since the Desktop Agent has
//! exactly one storage backend and no test-time swap requirement beyond
//! using an in-memory `sqlite::memory:` pool in `#[cfg(test)]`.

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::error::AppResult;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "TEXT")]
pub enum JobStatus {
    Queued,
    Running,
    Paused,
    Completed,
    Failed,
    Cancelled,
}

impl JobStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            JobStatus::Queued => "QUEUED",
            JobStatus::Running => "RUNNING",
            JobStatus::Paused => "PAUSED",
            JobStatus::Completed => "COMPLETED",
            JobStatus::Failed => "FAILED",
            JobStatus::Cancelled => "CANCELLED",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "RUNNING" => JobStatus::Running,
            "PAUSED" => JobStatus::Paused,
            "COMPLETED" => JobStatus::Completed,
            "FAILED" => JobStatus::Failed,
            "CANCELLED" => JobStatus::Cancelled,
            _ => JobStatus::Queued,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobRecord {
    pub id: String,
    pub kind: String,
    pub tool: String,
    pub target_id: String,
    pub project_id: String,
    pub status: String,
    pub priority: i64,
    pub attempt: i64,
    pub max_attempts: i64,
    pub timeout_seconds: i64,
    pub error_message: Option<String>,
    pub exit_code: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
}

pub struct JobsRepository {
    pool: SqlitePool,
}

impl JobsRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn enqueue(
        &self,
        id: &str,
        kind: &str,
        tool: &str,
        target_id: &str,
        project_id: &str,
        priority: i64,
        timeout_seconds: i64,
    ) -> AppResult<()> {
        sqlx::query(
            "INSERT INTO jobs (id, kind, tool, target_id, project_id, status, priority, timeout_seconds)
             VALUES (?1, ?2, ?3, ?4, ?5, 'QUEUED', ?6, ?7)",
        )
        .bind(id)
        .bind(kind)
        .bind(tool)
        .bind(target_id)
        .bind(project_id)
        .bind(priority)
        .bind(timeout_seconds)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Next queued job in priority order (highest first), oldest first
    /// among ties — classic FIFO-within-priority scheduling.
    pub async fn claim_next(&self) -> AppResult<Option<JobRecord>> {
        let row = sqlx::query_as::<_, (String, String, String, String, String, String, i64, i64, i64, i64, Option<String>, Option<i64>, String, String)>(
            "SELECT id, kind, tool, target_id, project_id, status, priority, attempt, max_attempts, timeout_seconds, error_message, exit_code, created_at, updated_at
             FROM jobs WHERE status = 'QUEUED'
             ORDER BY priority DESC, created_at ASC LIMIT 1",
        )
        .fetch_optional(&self.pool)
        .await?;

        let Some(r) = row else { return Ok(None) };

        sqlx::query(
            "UPDATE jobs SET status = 'RUNNING', started_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
             heartbeat_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id = ?1",
        )
        .bind(&r.0)
        .execute(&self.pool)
        .await?;

        Ok(Some(JobRecord {
            id: r.0,
            kind: r.1,
            tool: r.2,
            target_id: r.3,
            project_id: r.4,
            status: "RUNNING".into(),
            priority: r.6,
            attempt: r.7,
            max_attempts: r.8,
            timeout_seconds: r.9,
            error_message: r.10,
            exit_code: r.11,
            created_at: r.12,
            updated_at: r.13,
        }))
    }

    pub async fn heartbeat(&self, id: &str) -> AppResult<()> {
        sqlx::query(
            "UPDATE jobs SET heartbeat_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1",
        )
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn complete(&self, id: &str, exit_code: Option<i64>, raw_output: &str) -> AppResult<()> {
        sqlx::query(
            "UPDATE jobs SET status = 'COMPLETED', exit_code = ?2, raw_output = ?3,
             finished_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE id = ?1",
        )
        .bind(id)
        .bind(exit_code)
        .bind(raw_output)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Marks a job failed; if it has attempts remaining, resets it to
    /// QUEUED instead (Retry) with an incremented attempt counter —
    /// callers should re-poll rather than assume FAILED is terminal.
    pub async fn fail_or_retry(&self, id: &str, error_message: &str) -> AppResult<bool> {
        let (attempt, max_attempts): (i64, i64) =
            sqlx::query_as("SELECT attempt, max_attempts FROM jobs WHERE id = ?1")
                .bind(id)
                .fetch_one(&self.pool)
                .await?;

        if attempt + 1 < max_attempts {
            sqlx::query(
                "UPDATE jobs SET status = 'QUEUED', attempt = attempt + 1, error_message = ?2,
                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1",
            )
            .bind(id)
            .bind(error_message)
            .execute(&self.pool)
            .await?;
            Ok(true) // will retry
        } else {
            sqlx::query(
                "UPDATE jobs SET status = 'FAILED', error_message = ?2,
                 finished_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                 WHERE id = ?1",
            )
            .bind(id)
            .bind(error_message)
            .execute(&self.pool)
            .await?;
            Ok(false) // terminal
        }
    }

    pub async fn cancel(&self, id: &str) -> AppResult<()> {
        sqlx::query(
            "UPDATE jobs SET status = 'CANCELLED', finished_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1",
        )
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn pause(&self, id: &str) -> AppResult<()> {
        sqlx::query("UPDATE jobs SET status = 'PAUSED', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn resume(&self, id: &str) -> AppResult<()> {
        sqlx::query("UPDATE jobs SET status = 'QUEUED', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1 AND status = 'PAUSED'")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// Crash Recovery — on startup, any job stuck in RUNNING with a stale
    /// heartbeat (the app was killed mid-job) gets requeued.
    pub async fn recover_stale_running(&self, stale_after_seconds: i64) -> AppResult<u64> {
        let result = sqlx::query(
            "UPDATE jobs SET status = 'QUEUED', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
             WHERE status = 'RUNNING'
             AND (heartbeat_at IS NULL OR (julianday('now') - julianday(heartbeat_at)) * 86400 > ?1)",
        )
        .bind(stale_after_seconds)
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected())
    }

    pub async fn append_log(&self, job_id: &str, level: &str, message: &str) -> AppResult<()> {
        sqlx::query("INSERT INTO job_logs (job_id, level, message) VALUES (?1, ?2, ?3)")
            .bind(job_id)
            .bind(level)
            .bind(message)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn get(&self, id: &str) -> AppResult<Option<JobRecord>> {
        let row = sqlx::query_as::<_, (String, String, String, String, String, String, i64, i64, i64, i64, Option<String>, Option<i64>, String, String)>(
            "SELECT id, kind, tool, target_id, project_id, status, priority, attempt, max_attempts, timeout_seconds, error_message, exit_code, created_at, updated_at
             FROM jobs WHERE id = ?1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|r| JobRecord {
            id: r.0,
            kind: r.1,
            tool: r.2,
            target_id: r.3,
            project_id: r.4,
            status: r.5,
            priority: r.6,
            attempt: r.7,
            max_attempts: r.8,
            timeout_seconds: r.9,
            error_message: r.10,
            exit_code: r.11,
            created_at: r.12,
            updated_at: r.13,
        }))
    }

    pub async fn list_by_project(&self, project_id: &str) -> AppResult<Vec<JobRecord>> {
        let rows = sqlx::query_as::<_, (String, String, String, String, String, String, i64, i64, i64, i64, Option<String>, Option<i64>, String, String)>(
            "SELECT id, kind, tool, target_id, project_id, status, priority, attempt, max_attempts, timeout_seconds, error_message, exit_code, created_at, updated_at
             FROM jobs WHERE project_id = ?1 ORDER BY created_at DESC",
        )
        .bind(project_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|r| JobRecord {
                id: r.0,
                kind: r.1,
                tool: r.2,
                target_id: r.3,
                project_id: r.4,
                status: r.5,
                priority: r.6,
                attempt: r.7,
                max_attempts: r.8,
                timeout_seconds: r.9,
                error_message: r.10,
                exit_code: r.11,
                created_at: r.12,
                updated_at: r.13,
            })
            .collect())
    }
}

