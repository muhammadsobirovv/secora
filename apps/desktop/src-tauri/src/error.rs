//! Single error type for the whole Desktop Agent backend. Every Tauri
//! command returns `Result<T, AppError>` — `AppError` serializes to a
//! plain `{ code, message }` object across the IPC boundary so the React
//! frontend can pattern-match on `code` the same way it already does for
//! the web app's `AppException` (`apps/api/src/common/exceptions`),
//! keeping error-handling conventions consistent across both clients.

use serde::Serialize;
use std::fmt;

#[derive(Debug, Serialize)]
pub struct AppError {
    pub code: String,
    pub message: String,
}

impl AppError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }

    pub fn tool_not_found(tool: &str) -> Self {
        Self::new("TOOL_NOT_FOUND", format!("Tool \"{tool}\" is not registered."))
    }

    pub fn tool_binary_missing(tool: &str) -> Self {
        Self::new(
            "TOOL_BINARY_MISSING",
            format!(
                "\"{tool}\" binary was not found on PATH. Install it or set its path in Settings > Tools."
            ),
        )
    }

    pub fn job_not_found(id: &str) -> Self {
        Self::new("JOB_NOT_FOUND", format!("Job \"{id}\" not found."))
    }

    pub fn db(err: impl fmt::Display) -> Self {
        Self::new("DB_ERROR", err.to_string())
    }

    pub fn io(err: impl fmt::Display) -> Self {
        Self::new("IO_ERROR", err.to_string())
    }

    pub fn provider_not_configured(provider: &str) -> Self {
        Self::new(
            "AI_PROVIDER_NOT_CONFIGURED",
            format!("AI provider \"{provider}\" has no key/base URL configured."),
        )
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)
    }
}

impl std::error::Error for AppError {}

impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self {
        AppError::db(e)
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self {
        AppError::db(e)
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::io(e)
    }
}

impl From<anyhow::Error> for AppError {
    fn from(e: anyhow::Error) -> Self {
        AppError::new("INTERNAL_ERROR", e.to_string())
    }
}

impl From<reqwest::Error> for AppError {
    fn from(e: reqwest::Error) -> Self {
        AppError::new("HTTP_ERROR", e.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
