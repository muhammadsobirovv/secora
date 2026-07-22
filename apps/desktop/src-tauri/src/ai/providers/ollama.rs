//! Ollama — the no-key local default (ADR 0007: "Ollama as the no-key
//! default and a graceful degraded mode if even Ollama is unavailable").
//! Speaks its own NDJSON streaming format at `/api/chat`, not the OpenAI
//! shape (no SSE `data: ` prefix, one JSON object per line, no `[DONE]`
//! sentinel — the last line has `"done": true`).

use async_trait::async_trait;
use futures::StreamExt;
use serde_json::json;

use super::types::{
    emit, AiProvider, ChatMessage, ChatOptions, ChatRole, OnDelta, ProviderName,
    ResolvedCredential, StreamEvent,
};
use crate::error::{AppError, AppResult};

pub struct OllamaProvider {
    client: reqwest::Client,
}

impl OllamaProvider {
    pub fn new() -> Self {
        Self { client: reqwest::Client::new() }
    }
}

fn role_str(role: ChatRole) -> &'static str {
    match role {
        ChatRole::System => "system",
        ChatRole::User => "user",
        ChatRole::Assistant => "assistant",
        ChatRole::Tool => "tool",
    }
}

#[async_trait]
impl AiProvider for OllamaProvider {
    fn name(&self) -> ProviderName {
        ProviderName::Ollama
    }

    /// Always reports "configured" — Ollama needs no key, only a
    /// reachable local (or LAN) server, which is a runtime concern
    /// (connection refused → AppError at call time), not a config gate.
    fn is_configured(&self, _credential: &ResolvedCredential) -> bool {
        true
    }

    fn default_model(&self, credential: &ResolvedCredential) -> String {
        credential.model.clone().unwrap_or_else(|| "llama3.1".to_string())
    }

    async fn stream_chat(
        &self,
        messages: &[ChatMessage],
        options: &ChatOptions,
        credential: &ResolvedCredential,
        on_delta: OnDelta,
    ) -> AppResult<String> {
        let base = credential.base_url.clone().unwrap_or_else(|| "http://localhost:11434".to_string());
        let url = format!("{}/api/chat", base.trim_end_matches('/'));
        let model = options.model.clone().unwrap_or_else(|| self.default_model(credential));

        let msgs: Vec<_> = messages
            .iter()
            .map(|m| json!({ "role": role_str(m.role), "content": m.content }))
            .collect();

        let body = json!({ "model": model, "messages": msgs, "stream": true });

        let response = self.client.post(&url).json(&body).send().await.map_err(|e| {
            AppError::new(
                "OLLAMA_UNREACHABLE",
                format!("Could not reach Ollama at {base}: {e}. Is `ollama serve` running?"),
            )
        })?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            let err = format!("Ollama returned {status}: {text}");
            emit(&on_delta, StreamEvent::Error { message: err.clone() });
            return Err(AppError::new("AI_PROVIDER_ERROR", err));
        }

        let mut full = String::new();
        let mut buffer = String::new();
        let mut stream = response.bytes_stream();

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(AppError::from)?;
            buffer.push_str(&String::from_utf8_lossy(&chunk));

            while let Some(pos) = buffer.find('\n') {
                let line: String = buffer.drain(..pos + 1).collect();
                let line = line.trim();
                if line.is_empty() {
                    continue;
                }
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(line) {
                    if let Some(content) = parsed["message"]["content"].as_str() {
                        if !content.is_empty() {
                            full.push_str(content);
                            emit(&on_delta, StreamEvent::Delta { content: content.to_string() });
                        }
                    }
                }
            }
        }

        emit(&on_delta, StreamEvent::Done { full_content: full.clone() });
        Ok(full)
    }

    async fn embed(&self, texts: &[String], credential: &ResolvedCredential) -> AppResult<Vec<Vec<f32>>> {
        let base = credential.base_url.clone().unwrap_or_else(|| "http://localhost:11434".to_string());
        let url = format!("{}/api/embed", base.trim_end_matches('/'));
        let model = credential.model.clone().unwrap_or_else(|| "nomic-embed-text".to_string());

        let response = self
            .client
            .post(&url)
            .json(&json!({ "model": model, "input": texts }))
            .send()
            .await?;
        let parsed: serde_json::Value = response.json().await.map_err(AppError::from)?;
        let embeddings = parsed["embeddings"].as_array().cloned().unwrap_or_default();
        Ok(embeddings
            .into_iter()
            .map(|e| e.as_array().map(|a| a.iter().filter_map(|v| v.as_f64()).map(|f| f as f32).collect()).unwrap_or_default())
            .collect())
    }
}
