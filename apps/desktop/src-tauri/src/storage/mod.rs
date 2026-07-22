//! Local SQLite database — Projects/Targets/Recon Results/Scan Results/
//! Notes/Evidence/Reports/AI Chats/History/Settings/Offline Queue. One
//! file per user profile under the OS app-data dir
//! (`~/.local/share/ai.pentesthub.desktop/pentesthub.db` on Linux,
//! `%APPDATA%\ai.pentesthub.desktop\pentesthub.db` on Windows,
//! `~/Library/Application Support/ai.pentesthub.desktop/pentesthub.db` on
//! macOS — resolved by Tauri's `app_data_dir()`). Schema lives in
//! `migrations/0001_init.sql` and is applied via `sqlx::migrate!` at
//! startup, so upgrading the app upgrades the schema automatically.

pub mod repositories;

use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;
use std::path::Path;
use std::str::FromStr;

use crate::error::AppResult;

pub async fn open(db_path: &Path) -> AppResult<SqlitePool> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let options = SqliteConnectOptions::from_str(&format!("sqlite://{}", db_path.display()))
        .map_err(crate::error::AppError::from)?
        .create_if_missing(true)
        .foreign_keys(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(8)
        .connect_with(options)
        .await?;

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .map_err(|e| crate::error::AppError::db(e))?;

    Ok(pool)
}
