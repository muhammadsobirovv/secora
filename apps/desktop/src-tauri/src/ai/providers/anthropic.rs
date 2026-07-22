//! Anthropic — `POST /v1/messages` with `anthropic-version` header and
//! `x-api-key` (not `Authorization: Bearer`). SSE stream with named event
//! types (`content_block_delta`, `message_stop`, …), not the OpenAI
//! shape. No embeddings API (mirrors the backend adapter's same gap).

use async_trait::async_trait;
use futures::StreamExt;
use serde_json::json;

use super::types::{
    emit, AiProvider, ChatMessage, ChatOptions, ChatRole, OnDelta, ProviderName,
    ResolvedCredential, StreamEvent,
};
use crate::error::{AppError, AppResult};

const DEFAULT_BASE_URL: &str = "https://api.anthropic.com/v1";
const DEFAULT_MODEL: &str = "claude-3-5-sonnet-20241022";
const ANTHROPIC_VERSION: &str = "2023-06-01";

pub struct AnthropicProvider {
    client: reqwest::Client,
}

impl AnthropicProvider {
    pub fn new() -> Self {
        Self { client: reqwest::Client::new() }
    }
}

fn role_str(role: ChatRole) -> &'static str {
    match role {
        ChatRole::User | ChatRole::Tool => "user",
        ChatRole::Assistant => "assistant",
        ChatRole::System => "user", // system is a top-level param, filtered out below
    }
}

#[async_trait]
impl AiProvider for AnthropicProvider {
    fn name(&self) -> ProviderName {
        ProviderName::Anthropic
    }

    fn is_configured(&self, credential: &ResolvedCredential) -> bool {
        credential.api_key.is_some()
    }

    fn default_model(&self, credential: &ResolvedCredential) -> String {
        credential.model.clone().unwrap_or_else(|| DEFAULT_MODEL.to_string())
    }

    async fn stream_chat(
        &self,
        messages: &[ChatMessage],
        options: &ChatOptions,
        credential: &ResolvedCredential,
        on_delta: OnDelta,
    ) -> AppResult<String> {
        if !self.is_configured(credential) {
            return Err(AppError::provider_not_configured("ANTHROPIC"));
        }

        let base = credential.base_url.clone().unwrap_or_else(|| DEFAULT_BASE_URL.to_string());
        let url = format!("{}/messages", base.trim_end_matches('/'));
        let model = options.model.clone().unwrap_or_else(|| self.default_model(credential));

        let system: String = messages
            .iter()
            .filter(|m| m.role == ChatRole::System)
            .map(|m| m.content.clone())
            .collect::<Vec<_>>()
            .join("\n\n");

        let msgs: Vec<_> = messages
            .iter()
            .filter(|m| m.role != ChatRole::System)
            .map(|m| json!({ "role": role_str(m.role), "content": m.content }))
            .collect();

        let mut body = json!({
            "model": model,
            "messages": msgs,
            "stream": true,
            "max_tokens": options.max_tokens.unwrap_or(4096),
        });
        if !system.is_empty() {
            body["system"] = json!(system);
        }
        if let Some(t) = options.temperature {
            body["temperature"] = json!(t);
        }
        if !options.tools.is_empty() {
            body["tools"] = json!(options
                .tools
                .iter()
                .map(|t| json!({ "name": t.name, "description": t.description, "input_schema": t.parameters }))
                .collect::<Vec<_>>());
        }

        let response = self
            .client
            .post(&url)
            .header("x-api-key", credential.api_key.clone().unwrap_or_default())
            .header("anthropic-version", ANTHROPIC_VERSION)
            .json(&body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            let err = format!("Anthropic returned {status}: {text}");
            emit(&on_delta, StreamEvent::Error { message: err.clone() });
            return Err(AppError::new("AI_PROVIDER_ERROR", err));
        }

        let mut full = String::new();
        let mut buffer = String::new();
        let mut stream = response.bytes_stream();

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(AppError::from)?;
            buffer.push_str(&String::from_utf8_lossy(&chunk));

            while let Some(pos) = buffer.find("\n\n") {
                let block: String = buffer.drain(..pos + 2).collect();
                for line in block.lines() {
                    let Some(data) = line.strip_prefix("data: ") else { continue };
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                        if parsed["type"] == "content_block_delta" {
                            if let Some(text) = parsed["delta"]["text"].as_str() {
                                full.push_str(text);
                                emit(&on_delta, StreamEvent::Delta { content: text.to_string() });
                            }
                        }
                    }
                }
            }
        }

        emit(&on_delta, StreamEvent::Done { full_content: full.clone() });
        Ok(full)
    }
}
