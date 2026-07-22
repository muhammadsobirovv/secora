use tauri::State;
use uuid::Uuid;

use crate::error::AppResult;
use crate::state::AppState;
use crate::storage::repositories::projects::ProjectRecord;
use crate::storage::repositories::targets::TargetRecord;

#[tauri::command]
pub async fn create_project(
    state: State<'_, AppState>,
    name: String,
    description: Option<String>,
) -> AppResult<ProjectRecord> {
    let id = Uuid::new_v4().to_string();
    state.projects.create(&id, &name, description.as_deref()).await
}

#[tauri::command]
pub async fn list_projects(state: State<'_, AppState>) -> AppResult<Vec<ProjectRecord>> {
    state.projects.list().await
}

#[tauri::command]
pub async fn delete_project(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.projects.soft_delete(&id).await
}

#[tauri::command]
pub async fn create_target(
    state: State<'_, AppState>,
    project_id: String,
    target_type: String,
    value: String,
) -> AppResult<TargetRecord> {
    let id = Uuid::new_v4().to_string();
    state.targets.create(&id, &project_id, &target_type, &value).await
}

#[tauri::command]
pub async fn list_targets(state: State<'_, AppState>, project_id: String) -> AppResult<Vec<TargetRecord>> {
    state.targets.list_by_project(&project_id).await
}
