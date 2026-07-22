//! Google Gemini — `POST /v1beta/models/{model}:streamGenerateContent?alt=sse&key=...`.
//! Own request/response shape (`contents[].parts[].text`), API key as a
//! query param rather than a header.

use async_trait::async_trait;
use futures::StreamExt;
use serde_json::json;

use super::types::{
    emit, AiProvider, ChatMessage, ChatOptions, ChatRole, OnDelta, ProviderName,
    ResolvedCredential, StreamEvent,
};
use crate::error::{AppError, AppResult};

const DEFAULT_BASE_URL: &str = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL: &str = "gemini-1.5-flash";

pub struct GeminiProvider {
    client: reqwest::Client,
}

impl GeminiProvider {
    pub fn new() -> Self {
        Self { client: reqwest::Client::new() }
    }
}

#[async_trait]
impl AiProvider for GeminiProvider {
    fn name(&self) -> ProviderName {
        ProviderName::Gemini
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
            return Err(AppError::provider_not_configured("GEMINI"));
        }

        let base = credential.base_url.clone().unwrap_or_else(|| DEFAULT_BASE_URL.to_string());
        let model = options.model.clone().unwrap_or_else(|| self.default_model(credential));
        let key = credential.api_key.clone().unwrap_or_default();
        let url = format!("{}/models/{}:streamGenerateContent?alt=sse&key={}", base.trim_end_matches('/'), model, key);

        let system_instruction: Option<serde_json::Value> = {
            let sys: String = messages
                .iter()
                .filter(|m| m.role == ChatRole::System)
                .map(|m| m.content.clone())
                .collect::<Vec<_>>()
                .join("\n\n");
            if sys.is_empty() {
                None
            } else {
                Some(json!({ "parts": [{ "text": sys }] }))
            }
        };

        let contents: Vec<_> = messages
            .iter()
            .filter(|m| m.role != ChatRole::System)
            .map(|m| {
                let role = if m.role == ChatRole::Assistant { "model" } else { "user" };
                json!({ "role": role, "parts": [{ "text": m.content }] })
            })
            .collect();

        let mut body = json!({ "contents": contents });
        if let Some(sys) = system_instruction {
            body["systemInstruction"] = sys;
        }
        let mut generation_config = json!({});
        if let Some(t) = options.temperature {
            generation_config["temperature"] = json!(t);
        }
        if let Some(mt) = options.max_tokens {
            generation_config["maxOutputTokens"] = json!(mt);
        }
        if generation_config.as_object().map(|o| !o.is_empty()).unwrap_or(false) {
            body["generationConfig"] = generation_config;
        }

        let response = self.client.post(&url).json(&body).send().await?;
        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            let err = format!("Gemini returned {status}: {text}");
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
                        if let Some(text) = parsed["candidates"][0]["content"]["parts"][0]["text"].as_str() {
                            full.push_str(text);
                            emit(&on_delta, StreamEvent::Delta { content: text.to_string() });
                        }
                    }
                }
            }
        }

        emit(&on_delta, StreamEvent::Done { full_content: full.clone() });
        Ok(full)
    }

    async fn embed(&self, texts: &[String], credential: &ResolvedCredential) -> AppResult<Vec<Vec<f32>>> {
        let base = credential.base_url.clone().unwrap_or_else(|| DEFAULT_BASE_URL.to_string());
        let key = credential.api_key.clone().unwrap_or_default();
        let mut out = Vec::with_capacity(texts.len());
        for text in texts {
            let url = format!("{}/models/text-embedding-004:embedContent?key={}", base.trim_end_matches('/'), key);
            let body = json!({ "content": { "parts": [{ "text": text }] } });
            let response = self.client.post(&url).json(&body).send().await?;
            let parsed: serde_json::Value = response.json().await.map_err(AppError::from)?;
            let values = parsed["embedding"]["values"]
                .as_array()
                .map(|a| a.iter().filter_map(|v| v.as_f64()).map(|f| f as f32).collect())
                .unwrap_or_default();
            out.push(values);
        }
        Ok(out)
    }
}
