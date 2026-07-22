use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

use crate::ai::chat::{ConversationRecord, MessageRecord};
use crate::ai::providers::registry::ProviderStatus;
use crate::ai::providers::StreamEvent;
use crate::error::AppResult;
use crate::state::AppState;

#[tauri::command]
pub async fn list_ai_providers(state: State<'_, AppState>) -> AppResult<Vec<ProviderStatus>> {
    state.ai_providers.list_statuses().await
}

#[tauri::command]
pub async fn save_ai_provider_credential(
    state: State<'_, AppState>,
    provider: String,
    api_key: Option<String>,
    base_url: Option<String>,
    model: Option<String>,
) -> AppResult<()> {
    let name = crate::ai::providers::ProviderName::from_str(&provider)
        .ok_or_else(|| crate::error::AppError::new("INVALID_PROVIDER", format!("Unknown provider \"{provider}\".")))?;
    state
        .ai_providers
        .save_credential(name, api_key.as_deref(), base_url.as_deref(), model.as_deref())
        .await
}

#[tauri::command]
pub async fn delete_ai_provider_credential(state: State<'_, AppState>, provider: String) -> AppResult<()> {
    let name = crate::ai::providers::ProviderName::from_str(&provider)
        .ok_or_else(|| crate::error::AppError::new("INVALID_PROVIDER", format!("Unknown provider \"{provider}\".")))?;
    state.ai_providers.delete_credential(name).await
}

#[tauri::command]
pub async fn create_conversation(
    state: State<'_, AppState>,
    project_id: Option<String>,
    title: Option<String>,
) -> AppResult<ConversationRecord> {
    state.chat.create_conversation(project_id.as_deref(), title.as_deref()).await
}

#[tauri::command]
pub async fn list_conversations(state: State<'_, AppState>, project_id: Option<String>) -> AppResult<Vec<ConversationRecord>> {
    state.chat.list_conversations(project_id.as_deref()).await
}

#[tauri::command]
pub async fn get_conversation(state: State<'_, AppState>, id: String) -> AppResult<ConversationRecord> {
    state.chat.get_conversation(&id).await
}

#[tauri::command]
pub async fn list_messages(state: State<'_, AppState>, conversation_id: String) -> AppResult<Vec<MessageRecord>> {
    state.chat.list_messages(&conversation_id).await
}

#[tauri::command]
pub async fn pin_conversation(state: State<'_, AppState>, id: String, pinned: bool) -> AppResult<()> {
    state.chat.pin_conversation(&id, pinned).await
}

#[tauri::command]
pub async fn delete_conversation(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.chat.delete_conversation(&id).await
}

/// Sends a message and streams the reply as `ai://{conversation_id}/stream`
/// Tauri events (`StreamEvent`'s `delta`/`tool_call`/`done`/`error`
/// variants) — the frontend subscribes via `listen()` before calling this,
/// same "subscribe first, then trigger" pattern as the Job Queue's
/// `job://{id}/log` events. Returns the persisted assistant message id
/// once the stream completes.
#[tauri::command]
pub async fn send_message(
    app: AppHandle,
    state: State<'_, AppState>,
    conversation_id: String,
    content: String,
    provider: Option<String>,
) -> AppResult<String> {
    let stream_event_name = crate::ipc::event_name(crate::ipc::EventScheme::Ai, &conversation_id, "stream");
    let emit_handle = app.clone();
    let on_delta: Arc<dyn Fn(StreamEvent) + Send + Sync> = Arc::new(move |event: StreamEvent| {
        let _ = emit_handle.emit(&stream_event_name, &event);
    });

    state.chat.send_message(&conversation_id, &content, provider.as_deref(), on_delta).await
}

/// Cancellable id passthrough for future "stop generation" support — chat
/// generation today runs to completion within one `send_message` call
/// (no separate cancel token yet, unlike the Job Queue). Placeholder
/// signature kept stable so the frontend's "stop" button has something to
/// call once wired up.
#[tauri::command]
pub fn cancel_generation(_id: String) -> AppResult<()> {
    Ok(())
}
