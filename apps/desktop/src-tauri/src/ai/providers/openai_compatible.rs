//! One client for every provider that speaks the OpenAI Chat Completions
//! wire format: OpenAI itself, Groq, DeepSeek, OpenRouter, LM Studio, and
//! Azure OpenAI (which needs a slightly different URL shape — deployment
//! name in the path, `api-version` query param, `api-key` header instead
//! of `Authorization: Bearer`). Parameterized by `Flavor` rather than
//! duplicated per provider, since the wire format genuinely is identical
//! for six of the nine supported providers.

use async_trait::async_trait;
use futures::StreamExt;
use serde_json::json;

use super::types::{
    emit, AiProvider, ChatMessage, ChatOptions, ChatRole, OnDelta, ProviderName,
    ResolvedCredential, StreamEvent,
};
use crate::error::{AppError, AppResult};

#[derive(Clone, Copy)]
pub enum Flavor {
    OpenAi,
    Groq,
    Deepseek,
    Openrouter,
    LmStudio,
    AzureOpenai,
}

pub struct OpenAiCompatibleProvider {
    flavor: Flavor,
    default_base_url: &'static str,
    default_model: &'static str,
    client: reqwest::Client,
}

impl OpenAiCompatibleProvider {
    pub fn new(flavor: Flavor) -> Self {
        let (default_base_url, default_model) = match flavor {
            Flavor::OpenAi => ("https://api.openai.com/v1", "gpt-4o-mini"),
            Flavor::Groq => ("https://api.groq.com/openai/v1", "llama-3.3-70b-versatile"),
            Flavor::Deepseek => ("https://api.deepseek.com/v1", "deepseek-chat"),
            Flavor::Openrouter => ("https://openrouter.ai/api/v1", "openai/gpt-4o-mini"),
            Flavor::LmStudio => ("http://localhost:1234/v1", "local-model"),
            Flavor::AzureOpenai => ("", "gpt-4o-mini"), // base_url is mandatory (per-resource) for Azure
        };
        Self {
            flavor,
            default_base_url,
            default_model,
            client: reqwest::Client::new(),
        }
    }

    fn provider_name(&self) -> ProviderName {
        match self.flavor {
            Flavor::OpenAi => ProviderName::Openai,
            Flavor::Groq => ProviderName::Groq,
            Flavor::Deepseek => ProviderName::Deepseek,
            Flavor::Openrouter => ProviderName::Openrouter,
            Flavor::LmStudio => ProviderName::LmStudio,
            Flavor::AzureOpenai => ProviderName::AzureOpenai,
        }
    }

    fn base_url(&self, credential: &ResolvedCredential) -> String {
        credential
            .base_url
            .clone()
            .unwrap_or_else(|| self.default_base_url.to_string())
    }

    fn requires_key(&self) -> bool {
        !matches!(self.flavor, Flavor::LmStudio)
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
impl AiProvider for OpenAiCompatibleProvider {
    fn name(&self) -> ProviderName {
        self.provider_name()
    }

    fn is_configured(&self, credential: &ResolvedCredential) -> bool {
        if matches!(self.flavor, Flavor::AzureOpenai) && credential.base_url.is_none() {
            return false; // Azure has no sensible default endpoint
        }
        if self.requires_key() {
            credential.api_key.is_some()
        } else {
            true // LM Studio: reachability is checked at call time, not here
        }
    }

    fn default_model(&self, credential: &ResolvedCredential) -> String {
        credential.model.clone().unwrap_or_else(|| self.default_model.to_string())
    }

    async fn stream_chat(
        &self,
        messages: &[ChatMessage],
        options: &ChatOptions,
        credential: &ResolvedCredential,
        on_delta: OnDelta,
    ) -> AppResult<String> {
        if !self.is_configured(credential) {
            return Err(AppError::provider_not_configured(self.provider_name().as_str()));
        }

        let model = options.model.clone().unwrap_or_else(|| self.default_model(credential));
        let base = self.base_url(credential);
        let url = match self.flavor {
            Flavor::AzureOpenai => format!(
                "{}/openai/deployments/{}/chat/completions?api-version=2024-06-01",
                base.trim_end_matches('/'),
                model
            ),
            _ => format!("{}/chat/completions", base.trim_end_matches('/')),
        };

        let msgs: Vec<_> = messages
            .iter()
            .map(|m| json!({ "role": role_str(m.role), "content": m.content }))
            .collect();

        let mut body = json!({
            "model": model,
            "messages": msgs,
            "stream": true,
        });
        if let Some(t) = options.temperature {
            body["temperature"] = json!(t);
        }
        if let Some(mt) = options.max_tokens {
            body["max_tokens"] = json!(mt);
        }
        if !options.tools.is_empty() {
            body["tools"] = json!(options
                .tools
                .iter()
                .map(|t| json!({
                    "type": "function",
                    "function": { "name": t.name, "description": t.description, "parameters": t.parameters }
                }))
                .collect::<Vec<_>>());
        }

        let mut req = self.client.post(&url).json(&body);
        req = match self.flavor {
            Flavor::AzureOpenai => req.header("api-key", credential.api_key.clone().unwrap_or_default()),
            _ if self.requires_key() => {
                req.bearer_auth(credential.api_key.clone().unwrap_or_default())
            }
            _ => req,
        };
        if matches!(self.flavor, Flavor::Openrouter) {
            req = req.header("HTTP-Referer", "https://pentesthub.ai").header("X-Title", "Secora AI Desktop");
        }

        let response = req.send().await?;
        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            let err = format!("{} returned {status}: {text}", self.provider_name().as_str());
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
                    if data.trim() == "[DONE]" {
                        continue;
                    }
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                        if let Some(delta) = parsed["choices"][0]["delta"]["content"].as_str() {
                            full.push_str(delta);
                            emit(&on_delta, StreamEvent::Delta { content: delta.to_string() });
                        }
                        if let Some(tool_calls) = parsed["choices"][0]["delta"]["tool_calls"].as_array() {
                            for tc in tool_calls {
                                if let Some(fname) = tc["function"]["name"].as_str() {
                                    let args = tc["function"]["arguments"]
                                        .as_str()
                                        .and_then(|s| serde_json::from_str(s).ok())
                                        .unwrap_or(serde_json::Value::Null);
                                    emit(&on_delta, StreamEvent::ToolCall {
                                        tool_name: fname.to_string(),
                                        input: args,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        emit(&on_delta, StreamEvent::Done { full_content: full.clone() });
        Ok(full)
    }

    async fn embed(&self, texts: &[String], credential: &ResolvedCredential) -> AppResult<Vec<Vec<f32>>> {
        if !matches!(self.flavor, Flavor::OpenAi | Flavor::AzureOpenai) {
            return Err(AppError::new(
                "EMBEDDINGS_NOT_SUPPORTED",
                format!("{} has no embeddings API.", self.provider_name().as_str()),
            ));
        }
        let base = self.base_url(credential);
        let url = format!("{}/embeddings", base.trim_end_matches('/'));
        let body = json!({ "model": "text-embedding-3-small", "input": texts });

        let response = self
            .client
            .post(&url)
            .bearer_auth(credential.api_key.clone().unwrap_or_default())
            .json(&body)
            .send()
            .await?;
        let parsed: serde_json::Value = response.json().await.map_err(AppError::from)?;
        let data = parsed["data"].as_array().cloned().unwrap_or_default();
        Ok(data
            .into_iter()
            .map(|d| {
                d["embedding"]
                    .as_array()
                    .map(|arr| arr.iter().filter_map(|v| v.as_f64()).map(|f| f as f32).collect())
                    .unwrap_or_default()
            })
            .collect())
    }
}
