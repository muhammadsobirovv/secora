//! Retry/backoff bookkeeping over the `offline_queue` table. Not the
//! primary work queue (see `sync/mod.rs` module doc) — one row per
//! `(entity_type, entity_id)` currently failing to push, used to compute
//! exponential backoff and to surface "N items failing to sync, last
//! error: ..." in Settings > Sync.

use sqlx::SqlitePool;

use crate::error::AppResult;

pub struct RetryQueue {
    pool: SqlitePool,
}

#[derive(Debug, Clone, serde::Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct RetryEntry {
    pub entity_type: String,
    pub entity_id: String,
    pub operation: String,
    pub attempt: i64,
    pub last_error: Option<String>,
    pub created_at: String,
}

impl RetryQueue {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    /// Exponential backoff: 5s, 10s, 20s, 40s, 80s, 160s, plateauing at
    /// 320s from attempt 6 onward (the `attempt.min(6)` shift clamp) — the
    /// outer `.min(600)` is a belt-and-suspenders cap that never actually
    /// triggers at that plateau, kept in case the shift clamp is ever
    /// raised. Keeps a flaky connection from hammering the backend while
    /// still recovering quickly once connectivity returns.
    fn backoff_seconds(attempt: i64) -> i64 {
        (5i64.saturating_mul(1i64 << attempt.min(6))).min(600)
    }

    /// Whether this entity is currently in backoff (should be skipped this
    /// sync cycle) — `None`/no row means "never failed, always due."
    pub async fn is_due(&self, entity_type: &str, entity_id: &str) -> AppResult<bool> {
        let row: Option<(i64, String)> = sqlx::query_as(
            "SELECT attempt, created_at FROM offline_queue WHERE entity_type = ?1 AND entity_id = ?2",
        )
        .bind(entity_type)
        .bind(entity_id)
        .fetch_optional(&self.pool)
        .await?;

        let Some((attempt, last_attempt_at)) = row else {
            return Ok(true);
        };

        let last_attempt = chrono::DateTime::parse_from_rfc3339(&last_attempt_at)
            .map(|dt| dt.with_timezone(&chrono::Utc))
            .unwrap_or_else(|_| chrono::Utc::now());
        let due_at = last_attempt + chrono::Duration::seconds(Self::backoff_seconds(attempt));
        Ok(chrono::Utc::now() >= due_at)
    }

    pub async fn record_success(&self, entity_type: &str, entity_id: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM offline_queue WHERE entity_type = ?1 AND entity_id = ?2")
            .bind(entity_type)
            .bind(entity_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn record_failure(&self, entity_type: &str, entity_id: &str, operation: &str, error: &str) -> AppResult<()> {
        // The table's primary key is a bare autoincrement id, not
        // (entity_type, entity_id), so "insert or bump attempt" is an
        // explicit check-then-write rather than a real ON CONFLICT upsert.
        let existing: Option<(i64,)> = sqlx::query_as(
            "SELECT id FROM offline_queue WHERE entity_type = ?1 AND entity_id = ?2 ORDER BY id DESC LIMIT 1",
        )
        .bind(entity_type)
        .bind(entity_id)
        .fetch_optional(&self.pool)
        .await?;

        if let Some((id,)) = existing {
            sqlx::query(
                "UPDATE offline_queue SET attempt = attempt + 1, last_error = ?1, created_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?2",
            )
            .bind(error)
            .bind(id)
            .execute(&self.pool)
            .await?;
        } else {
            sqlx::query(
                "INSERT INTO offline_queue (entity_type, entity_id, operation, payload, attempt, last_error)
                 VALUES (?1, ?2, ?3, '{}', 1, ?4)",
            )
            .bind(entity_type)
            .bind(entity_id)
            .bind(operation)
            .bind(error)
            .execute(&self.pool)
            .await?;
        }

        Ok(())
    }

    pub async fn list(&self) -> AppResult<Vec<RetryEntry>> {
        let rows = sqlx::query_as::<_, RetryEntry>(
            "SELECT entity_type, entity_id, operation, attempt, last_error, created_at FROM offline_queue ORDER BY created_at DESC",
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }
}

#[cfg(test)]
mod tests {
    use super::RetryQueue;

    #[test]
    fn backoff_grows_exponentially_and_caps_at_ten_minutes() {
        assert_eq!(RetryQueue::backoff_seconds(0), 5);
        assert_eq!(RetryQueue::backoff_seconds(1), 10);
        assert_eq!(RetryQueue::backoff_seconds(2), 20);
        assert_eq!(RetryQueue::backoff_seconds(3), 40);
        assert_eq!(RetryQueue::backoff_seconds(4), 80);
        assert_eq!(RetryQueue::backoff_seconds(5), 160);
        assert_eq!(RetryQueue::backoff_seconds(6), 320);
        // Beyond attempt 6 the shift is clamped (`attempt.min(6)`), so the
        // backoff plateaus rather than overflowing i64 on a pathologically
        // long-failing entity.
        assert_eq!(RetryQueue::backoff_seconds(7), 320);
        assert_eq!(RetryQueue::backoff_seconds(100), 320);
    }
}
