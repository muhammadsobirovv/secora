//! Conversation/message persistence + streaming orchestration for the
//! Desktop Chat UI. Mirrors `apps/api/src/modules/ai/chat/ai-chat.service.ts`'s
//! responsibilities (resolve provider → stream → persist → forward tool
//! calls) but runs entirely in-process, emitting Tauri events instead of
//! writing SSE frames to an HTTP response.

use serde::Serialize;
use sqlx::SqlitePool;
use std::sync::{Arc, Mutex};
use uuid::Uuid;

use super::providers::{ChatMessage, ChatOptions, ChatRole, OnDelta, ProviderName, ProviderRegistry, StreamEvent};
use super::tools::ToolRegistry;
use crate::error::AppResult;

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ConversationRecord {
    pub id: String,
    pub project_id: Option<String>,
    pub title: Option<String>,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub pinned: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct MessageRecord {
    pub id: String,
    pub conversation_id: String,
    pub role: String,
    pub content: String,
    pub status: String,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub created_at: String,
}

pub struct ChatService {
    db: SqlitePool,
    providers: Arc<ProviderRegistry>,
    tools: Arc<ToolRegistry>,
}

impl ChatService {
    pub fn new(db: SqlitePool, providers: Arc<ProviderRegistry>, tools: Arc<ToolRegistry>) -> Self {
        Self { db, providers, tools }
    }

    pub async fn create_conversation(&self, project_id: Option<&str>, title: Option<&str>) -> AppResult<ConversationRecord> {
        let id = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO ai_conversations (id, project_id, title) VALUES (?1, ?2, ?3)")
            .bind(&id)
            .bind(project_id)
            .bind(title)
            .execute(&self.db)
            .await?;
        self.get_conversation(&id).await
    }

    pub async fn get_conversation(&self, id: &str) -> AppResult<ConversationRecord> {
        let row = sqlx::query_as::<_, ConversationRecord>(
            "SELECT id, project_id, title, provider, model, pinned, created_at, updated_at
             FROM ai_conversations WHERE id = ?1",
        )
        .bind(id)
        .fetch_one(&self.db)
        .await?;
        Ok(row)
    }

    pub async fn list_conversations(&self, project_id: Option<&str>) -> AppResult<Vec<ConversationRecord>> {
        let rows = if let Some(pid) = project_id {
            sqlx::query_as::<_, ConversationRecord>(
                "SELECT id, project_id, title, provider, model, pinned, created_at, updated_at
                 FROM ai_conversations WHERE project_id = ?1 ORDER BY updated_at DESC",
            )
            .bind(pid)
            .fetch_all(&self.db)
            .await?
        } else {
            sqlx::query_as::<_, ConversationRecord>(
                "SELECT id, project_id, title, provider, model, pinned, created_at, updated_at
                 FROM ai_conversations ORDER BY updated_at DESC",
            )
            .fetch_all(&self.db)
            .await?
        };
        Ok(rows)
    }

    pub async fn list_messages(&self, conversation_id: &str) -> AppResult<Vec<MessageRecord>> {
        let rows = sqlx::query_as::<_, MessageRecord>(
            "SELECT id, conversation_id, role, content, status, provider, model, created_at
             FROM ai_messages WHERE conversation_id = ?1 ORDER BY created_at ASC",
        )
        .bind(conversation_id)
        .fetch_all(&self.db)
        .await?;
        Ok(rows)
    }

    pub async fn pin_conversation(&self, id: &str, pinned: bool) -> AppResult<()> {
        sqlx::query("UPDATE ai_conversations SET pinned = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1")
            .bind(id)
            .bind(pinned)
            .execute(&self.db)
            .await?;
        Ok(())
    }

    pub async fn delete_conversation(&self, id: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM ai_conversations WHERE id = ?1").bind(id).execute(&self.db).await?;
        Ok(())
    }

    /// Persists the user message, streams the assistant's reply (invoking
    /// `on_delta` per event — the caller wires this to a Tauri event
    /// emitter, see `commands::ai_commands::send_message`), executes at
    /// most one round of tool calls if the model requests any, and
    /// persists the final assistant message. Returns the assistant
    /// message id.
    pub async fn send_message(
        &self,
        conversation_id: &str,
        content: &str,
        preferred_provider: Option<&str>,
        on_delta: OnDelta,
    ) -> AppResult<String> {
        let user_msg_id = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO ai_messages (id, conversation_id, role, content, status) VALUES (?1, ?2, 'USER', ?3, 'COMPLETE')")
            .bind(&user_msg_id)
            .bind(conversation_id)
            .bind(content)
            .execute(&self.db)
            .await?;

        let history = self.list_messages(conversation_id).await?;
        let mut messages: Vec<ChatMessage> = history
            .iter()
            .map(|m| ChatMessage {
                role: match m.role.as_str() {
                    "USER" => ChatRole::User,
                    "ASSISTANT" => ChatRole::Assistant,
                    "TOOL" => ChatRole::Tool,
                    _ => ChatRole::System,
                },
                content: m.content.clone(),
                tool_call_id: None,
                tool_name: None,
            })
            .collect();

        let preferred = preferred_provider.and_then(ProviderName::from_str);
        let (provider, credential) = self.providers.resolve(preferred).await?;

        let options = ChatOptions {
            model: None,
            temperature: Some(0.4),
            max_tokens: Some(4096),
            tools: self.tools.definitions(),
        };

        let db = self.db.clone();
        let tools = self.tools.clone();

        // `Fn` (not `FnMut`) can't close over `&mut` state directly, so
        // tool-call detection goes through a shared `Mutex` instead —
        // `on_delta` itself is cloned via `Arc` into the wrapper closure,
        // then reused as-is for the second `stream_chat` call below.
        let pending_tool: Arc<Mutex<Option<(String, serde_json::Value)>>> = Arc::new(Mutex::new(None));
        let pending_tool_writer = pending_tool.clone();
        let on_delta_outer = on_delta.clone();
        let wrapped_on_delta: OnDelta = Arc::new(move |event: StreamEvent| {
            if let StreamEvent::ToolCall { tool_name, input } = &event {
                *pending_tool_writer.lock().expect("pending_tool mutex poisoned") =
                    Some((tool_name.clone(), input.clone()));
            }
            (on_delta_outer.as_ref())(event);
        });

        let first_pass = provider.stream_chat(&messages, &options, &credential, wrapped_on_delta).await?;
        let detected_tool_call = pending_tool.lock().expect("pending_tool mutex poisoned").take();

        let final_text = if let Some((tool_name, input)) = detected_tool_call {
            let result = tools.execute(&tool_name, &input, &db).await.unwrap_or_else(|e| {
                serde_json::json!({ "error": e.message })
            });
            messages.push(ChatMessage {
                role: ChatRole::Assistant,
                content: first_pass.clone(),
                tool_call_id: None,
                tool_name: Some(tool_name.clone()),
            });
            messages.push(ChatMessage {
                role: ChatRole::Tool,
                content: result.to_string(),
                tool_call_id: None,
                tool_name: Some(tool_name),
            });

            provider.stream_chat(&messages, &options, &credential, on_delta.clone()).await?
        } else {
            first_pass
        };

        let assistant_msg_id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO ai_messages (id, conversation_id, role, content, status, provider, model)
             VALUES (?1, ?2, 'ASSISTANT', ?3, 'COMPLETE', ?4, ?5)",
        )
        .bind(&assistant_msg_id)
        .bind(conversation_id)
        .bind(&final_text)
        .bind(provider.name().as_str())
        .bind(provider.default_model(&credential))
        .execute(&self.db)
        .await?;

        sqlx::query(
            "UPDATE ai_conversations SET provider = ?2, model = ?3, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1",
        )
        .bind(conversation_id)
        .bind(provider.name().as_str())
        .bind(provider.default_model(&credential))
        .execute(&self.db)
        .await?;

        Ok(assistant_msg_id)
    }
}
