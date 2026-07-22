use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::error::AppResult;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ProviderName {
    Ollama,
    LmStudio,
    Openai,
    Anthropic,
    Gemini,
    Openrouter,
    Groq,
    Deepseek,
    AzureOpenai,
}

impl ProviderName {
    pub fn as_str(&self) -> &'static str {
        match self {
            ProviderName::Ollama => "OLLAMA",
            ProviderName::LmStudio => "LM_STUDIO",
            ProviderName::Openai => "OPENAI",
            ProviderName::Anthropic => "ANTHROPIC",
            ProviderName::Gemini => "GEMINI",
            ProviderName::Openrouter => "OPENROUTER",
            ProviderName::Groq => "GROQ",
            ProviderName::Deepseek => "DEEPSEEK",
            ProviderName::AzureOpenai => "AZURE_OPENAI",
        }
    }

    pub fn all() -> &'static [ProviderName] {
        &[
            ProviderName::Ollama,
            ProviderName::LmStudio,
            ProviderName::Openai,
            ProviderName::Anthropic,
            ProviderName::Gemini,
            ProviderName::Openrouter,
            ProviderName::Groq,
            ProviderName::Deepseek,
            ProviderName::AzureOpenai,
        ]
    }

    pub fn from_str(s: &str) -> Option<Self> {
        Some(match s {
            "OLLAMA" => ProviderName::Ollama,
            "LM_STUDIO" => ProviderName::LmStudio,
            "OPENAI" => ProviderName::Openai,
            "ANTHROPIC" => ProviderName::Anthropic,
            "GEMINI" => ProviderName::Gemini,
            "OPENROUTER" => ProviderName::Openrouter,
            "GROQ" => ProviderName::Groq,
            "DEEPSEEK" => ProviderName::Deepseek,
            "AZURE_OPENAI" => ProviderName::AzureOpenai,
            _ => return None,
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum ChatRole {
    System,
    User,
    Assistant,
    Tool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: ChatRole,
    pub content: String,
    /// Present on Assistant messages that invoked a tool — threaded
    /// through so multi-turn tool-calling conversations keep context.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value, // JSON Schema
}

#[derive(Debug, Clone, Default)]
pub struct ChatOptions {
    pub model: Option<String>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    pub tools: Vec<ToolDefinition>,
}

/// Credential resolved from `ai::credentials` (OS keychain) +
/// `ai_provider_credentials` (SQLite, base_url/model only) — the Desktop
/// Agent's equivalent of the backend's `ResolvedAiCredential`.
#[derive(Debug, Clone, Default)]
pub struct ResolvedCredential {
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub model: Option<String>,
}

/// One chunk of a streaming response — forwarded to the frontend as a
/// Tauri event (`ai://{conversation_id}/stream`), same shape as the
/// backend's `AiChatMessageStreamEvent` (packages/shared/src/ai.ts) so the
/// Desktop Chat UI can reuse the same event-handling logic conceptually.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum StreamEvent {
    Delta { content: String },
    ToolCall {
        #[serde(rename = "toolName")]
        tool_name: String,
        input: serde_json::Value,
    },
    Done {
        #[serde(rename = "fullContent")]
        full_content: String,
    },
    Error { message: String },
}

/// `Arc<dyn Fn>` rather than `Box<dyn FnMut>` deliberately — callers
/// (`ai::chat::ChatService`) need to clone/share the same sink across two
/// potential `stream_chat` calls (the tool-calling round-trip) and across
/// thread-hopping Tauri event emission, which is far simpler with `Fn` +
/// `Arc` than juggling `FnMut` ownership through nested boxed closures.
pub type OnDelta = Arc<dyn Fn(StreamEvent) + Send + Sync>;

/// `Arc<dyn Fn>` has no direct call-operator impl in stable Rust (only
/// `Box<dyn Fn>`/`&dyn Fn` do) — this helper derefs to `&dyn Fn` first so
/// every call site can write `emit(&on_delta, event)` instead of
/// re-deriving the same `.as_ref()` dance inline.
pub fn emit(on_delta: &OnDelta, event: StreamEvent) {
    (on_delta.as_ref())(event)
}

#[async_trait]
pub trait AiProvider: Send + Sync {
    fn name(&self) -> ProviderName;

    fn is_configured(&self, credential: &ResolvedCredential) -> bool;

    fn default_model(&self, credential: &ResolvedCredential) -> String;

    /// Streams a chat completion, invoking `on_delta` for every token/
    /// tool-call/terminal event. Returns the full assembled text on
    /// success (also delivered as the final `Done` event) so callers that
    /// just want the final string don't have to reassemble it themselves.
    async fn stream_chat(
        &self,
        messages: &[ChatMessage],
        options: &ChatOptions,
        credential: &ResolvedCredential,
        on_delta: OnDelta,
    ) -> AppResult<String>;

    /// Not every provider supports embeddings (Anthropic/Groq/DeepSeek/
    /// OpenRouter don't) — used for Local RAG. Default: unsupported.
    async fn embed(&self, _texts: &[String], _credential: &ResolvedCredential) -> AppResult<Vec<Vec<f32>>> {
        Err(crate::error::AppError::new(
            "EMBEDDINGS_NOT_SUPPORTED",
            format!("{} has no embeddings API.", self.name().as_str()),
        ))
    }
}
