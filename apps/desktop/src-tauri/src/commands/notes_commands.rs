use tauri::State;

use crate::error::AppResult;
use crate::state::AppState;
use crate::storage::repositories::notes::NoteRecord;

#[tauri::command]
pub async fn create_note(state: State<'_, AppState>, project_id: String, title: Option<String>, content: String) -> AppResult<NoteRecord> {
    let id = uuid::Uuid::new_v4().to_string();
    state.notes.create(&id, &project_id, title.as_deref(), &content).await
}

#[tauri::command]
pub async fn update_note(state: State<'_, AppState>, id: String, title: Option<String>, content: String) -> AppResult<NoteRecord> {
    state.notes.update(&id, title.as_deref(), &content).await
}

#[tauri::command]
pub async fn list_notes(state: State<'_, AppState>, project_id: String) -> AppResult<Vec<NoteRecord>> {
    state.notes.list(&project_id).await
}

#[tauri::command]
pub async fn get_note(state: State<'_, AppState>, id: String) -> AppResult<Option<NoteRecord>> {
    state.notes.get(&id).await
}

#[tauri::command]
pub async fn delete_note(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.notes.soft_delete(&id).await
}
