//! Thin HTTP client for the Sync Engine. Talks to a `/desktop-sync/*`
//! surface on the backend (workspace-scoped, bearer-token authenticated).
//! This surface is a Phase 2 backend addition per ADR 0007 — the Desktop
//! Agent (Module 7) ships the client fully implemented against this
//! contract now so sync "just works" the moment the backend endpoints
//! land; until then, `push`/`pull` fail with a normal `HTTP_ERROR`/
//! connection-refused `AppError`, which the engine already treats as
//! "retry later" (see `sync::queue::RetryQueue`), so an absent backend
//! degrades to harmless background retries rather than breaking anything.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::{AppError, AppResult};

pub struct SyncClient {
    http: reqwest::Client,
}

#[derive(Debug, Serialize)]
pub struct PushRequest<'a> {
    pub workspace_id: &'a str,
    pub operation: &'a str, // CREATE | UPDATE | DELETE
    pub remote_id: Option<&'a str>,
    pub data: Value,
}

#[derive(Debug, Deserialize)]
pub struct PushResponse {
    pub remote_id: String,
    pub updated_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PullResponse {
    pub items: Vec<PulledItem>,
    pub synced_at: String,
}

#[derive(Debug, Deserialize)]
pub struct PulledItem {
    pub remote_id: String,
    pub data: Value,
    pub updated_at: String,
    #[serde(default)]
    pub deleted: bool,
}

impl SyncClient {
    pub fn new() -> Self {
        Self {
            http: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .expect("reqwest client builds"),
        }
    }

    pub async fn test_connection(&self, base_url: &str, token: &str) -> AppResult<()> {
        let url = format!("{}/desktop-sync/ping", base_url.trim_end_matches('/'));
        let resp = self.http.get(&url).bearer_auth(token).send().await?;
        if resp.status().is_success() {
            Ok(())
        } else {
            Err(AppError::new("SYNC_CONNECTION_FAILED", format!("Sync server responded {}", resp.status())))
        }
    }

    pub async fn push(&self, base_url: &str, token: &str, entity_type: &str, req: &PushRequest<'_>) -> AppResult<PushResponse> {
        let url = format!("{}/desktop-sync/{}", base_url.trim_end_matches('/'), entity_type.to_lowercase());
        let resp = self.http.post(&url).bearer_auth(token).json(req).send().await?;
        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(AppError::new("SYNC_PUSH_FAILED", format!("{status}: {body}")));
        }
        resp.json::<PushResponse>().await.map_err(AppError::from)
    }

    pub async fn pull(
        &self,
        base_url: &str,
        token: &str,
        entity_type: &str,
        workspace_id: &str,
        since: Option<&str>,
    ) -> AppResult<PullResponse> {
        let mut url = format!(
            "{}/desktop-sync/{}?workspaceId={}",
            base_url.trim_end_matches('/'),
            entity_type.to_lowercase(),
            urlencoding_lite(workspace_id),
        );
        if let Some(since) = since {
            url.push_str(&format!("&since={}", urlencoding_lite(since)));
        }
        let resp = self.http.get(&url).bearer_auth(token).send().await?;
        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(AppError::new("SYNC_PULL_FAILED", format!("{status}: {body}")));
        }
        resp.json::<PullResponse>().await.map_err(AppError::from)
    }
}

impl Default for SyncClient {
    fn default() -> Self {
        Self::new()
    }
}

/// Minimal query-param escaping — avoids pulling in the `url`/`urlencoding`
/// crate for the handful of characters that actually show up in workspace
/// ids (UUIDs) and RFC3339 timestamps (`:`, `+`).
fn urlencoding_lite(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            ':' => "%3A".to_string(),
            '+' => "%2B".to_string(),
            ' ' => "%20".to_string(),
            c => c.to_string(),
        })
        .collect()
}
