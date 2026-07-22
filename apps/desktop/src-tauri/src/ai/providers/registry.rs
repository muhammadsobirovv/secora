//! Resolves a provider by name and its credential (OS keychain + SQLite
//! base_url/model) on every call — "provider switching without restart"
//! falls out naturally from this being a lookup, not a fixed field on
//! `AppState`: the frontend just calls `stream_chat` with a different
//! `provider` argument on the next message and this resolves fresh.

use std::collections::HashMap;
use std::sync::Arc;

use sqlx::SqlitePool;

use super::anthropic::AnthropicProvider;
use super::gemini::GeminiProvider;
use super::ollama::OllamaProvider;
use super::openai_compatible::{Flavor, OpenAiCompatibleProvider};
use super::types::{AiProvider, ProviderName, ResolvedCredential};
use crate::ai::credentials;
use crate::error::{AppError, AppResult};

pub struct ProviderRegistry {
    providers: HashMap<ProviderName, Arc<dyn AiProvider>>,
    db: SqlitePool,
}

impl ProviderRegistry {
    pub fn new(db: SqlitePool) -> Self {
        let mut providers: HashMap<ProviderName, Arc<dyn AiProvider>> = HashMap::new();
        providers.insert(ProviderName::Ollama, Arc::new(OllamaProvider::new()));
        providers.insert(ProviderName::Openai, Arc::new(OpenAiCompatibleProvider::new(Flavor::OpenAi)));
        providers.insert(ProviderName::Anthropic, Arc::new(AnthropicProvider::new()));
        providers.insert(ProviderName::Gemini, Arc::new(GeminiProvider::new()));
        providers.insert(ProviderName::Openrouter, Arc::new(OpenAiCompatibleProvider::new(Flavor::Openrouter)));
        providers.insert(ProviderName::Groq, Arc::new(OpenAiCompatibleProvider::new(Flavor::Groq)));
        providers.insert(ProviderName::Deepseek, Arc::new(OpenAiCompatibleProvider::new(Flavor::Deepseek)));
        providers.insert(ProviderName::LmStudio, Arc::new(OpenAiCompatibleProvider::new(Flavor::LmStudio)));
        providers.insert(ProviderName::AzureOpenai, Arc::new(OpenAiCompatibleProvider::new(Flavor::AzureOpenai)));
        Self { providers, db }
    }

    pub fn get(&self, name: ProviderName) -> Arc<dyn AiProvider> {
        self.providers.get(&name).cloned().expect("all ProviderName variants registered")
    }

    /// OS keychain (secret) + SQLite (`base_url`/`model`, non-secret) —
    /// see `migrations/0001_init.sql`'s `ai_provider_credentials` table.
    pub async fn resolve_credential(&self, name: ProviderName) -> AppResult<ResolvedCredential> {
        let row: Option<(Option<String>, Option<String>)> = sqlx::query_as(
            "SELECT base_url, model FROM ai_provider_credentials WHERE provider = ?1",
        )
        .bind(name.as_str())
        .fetch_optional(&self.db)
        .await?;

        let api_key = credentials::read_secret(name.as_str())?;
        let (base_url, model) = row.unwrap_or((None, None));

        Ok(ResolvedCredential { api_key, base_url, model })
    }

    pub async fn save_credential(
        &self,
        name: ProviderName,
        api_key: Option<&str>,
        base_url: Option<&str>,
        model: Option<&str>,
    ) -> AppResult<()> {
        if let Some(key) = api_key {
            if key.is_empty() {
                credentials::delete_secret(name.as_str())?;
            } else {
                credentials::store_secret(name.as_str(), key)?;
            }
        }

        let preview = api_key
            .filter(|k| !k.is_empty())
            .map(|k| if k.len() <= 4 { "••••".to_string() } else { format!("••••{}", &k[k.len() - 4..]) });

        sqlx::query(
            "INSERT INTO ai_provider_credentials (provider, keyring_ref, key_preview, base_url, model)
             VALUES (?1, ?1, ?2, ?3, ?4)
             ON CONFLICT(provider) DO UPDATE SET
               key_preview = COALESCE(?2, ai_provider_credentials.key_preview),
               base_url = ?3, model = ?4, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')",
        )
        .bind(name.as_str())
        .bind(preview)
        .bind(base_url)
        .bind(model)
        .execute(&self.db)
        .await?;

        Ok(())
    }

    pub async fn delete_credential(&self, name: ProviderName) -> AppResult<()> {
        credentials::delete_secret(name.as_str())?;
        sqlx::query("DELETE FROM ai_provider_credentials WHERE provider = ?1")
            .bind(name.as_str())
            .execute(&self.db)
            .await?;
        Ok(())
    }

    /// Resolves the provider to use, preferring an explicit choice if
    /// configured, else the first configured provider in `ProviderName::all()`
    /// order (Ollama first — the no-key default per ADR 0007).
    pub async fn resolve(&self, preferred: Option<ProviderName>) -> AppResult<(Arc<dyn AiProvider>, ResolvedCredential)> {
        if let Some(name) = preferred {
            let provider = self.get(name);
            let credential = self.resolve_credential(name).await?;
            if provider.is_configured(&credential) {
                return Ok((provider, credential));
            }
        }

        for &name in ProviderName::all() {
            let provider = self.get(name);
            let credential = self.resolve_credential(name).await?;
            if provider.is_configured(&credential) {
                return Ok((provider, credential));
            }
        }

        Err(AppError::new(
            "NO_AI_PROVIDER_CONFIGURED",
            "No AI provider is configured. Install Ollama locally or add a key in Settings > AI Providers.",
        ))
    }

    pub async fn list_statuses(&self) -> AppResult<Vec<ProviderStatus>> {
        let mut out = Vec::with_capacity(ProviderName::all().len());
        for &name in ProviderName::all() {
            let provider = self.get(name);
            let credential = self.resolve_credential(name).await?;
            let configured = provider.is_configured(&credential);
            out.push(ProviderStatus {
                provider: name.as_str().to_string(),
                configured,
                default_model: if configured { Some(provider.default_model(&credential)) } else { None },
                byok: credential.api_key.is_some() || credential.base_url.is_some(),
            });
        }
        Ok(out)
    }
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderStatus {
    pub provider: String,
    pub configured: bool,
    pub default_model: Option<String>,
    pub byok: bool,
}
