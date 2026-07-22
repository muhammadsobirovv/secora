//! Key-value settings store — Theme/Language/Voice/AI Provider/Sync/
//! Storage/Tools/Updates all persist here as JSON-encoded values under a
//! namespaced key (e.g. `"settings.theme"`, `"tools.ffuf.wordlist"`).

use serde::de::DeserializeOwned;
use serde::Serialize;
use sqlx::SqlitePool;

use crate::error::AppResult;

pub struct SettingsRepository {
    pool: SqlitePool,
}

impl SettingsRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn set<T: Serialize>(&self, key: &str, value: &T) -> AppResult<()> {
        let json = serde_json::to_string(value)
            .map_err(|e| crate::error::AppError::new("SERIALIZE_ERROR", e.to_string()))?;
        sqlx::query("INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
            .bind(key)
            .bind(json)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn get<T: DeserializeOwned>(&self, key: &str) -> AppResult<Option<T>> {
        let row: Option<(String,)> = sqlx::query_as("SELECT value FROM settings WHERE key = ?1")
            .bind(key)
            .fetch_optional(&self.pool)
            .await?;
        match row {
            Some((json,)) => Ok(Some(serde_json::from_str(&json).map_err(|e| {
                crate::error::AppError::new("DESERIALIZE_ERROR", e.to_string())
            })?)),
            None => Ok(None),
        }
    }

    pub async fn all(&self) -> AppResult<Vec<(String, String)>> {
        let rows: Vec<(String, String)> =
            sqlx::query_as("SELECT key, value FROM settings").fetch_all(&self.pool).await?;
        Ok(rows)
    }
}
