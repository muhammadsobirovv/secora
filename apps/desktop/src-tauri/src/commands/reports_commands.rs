use tauri::{AppHandle, Manager, State};

use crate::error::AppResult;
use crate::reports::ReportFormat;
use crate::state::AppState;
use crate::storage::repositories::reports::ReportRecord;

#[tauri::command]
pub async fn generate_report(app: AppHandle, state: State<'_, AppState>, project_id: String, format: ReportFormat) -> AppResult<ReportRecord> {
    let data_dir = app.path().app_data_dir().map_err(|e| crate::error::AppError::new("PATH_ERROR", e.to_string()))?;
    let output_dir = data_dir.join("reports").join(&project_id);

    let (path, content) = crate::reports::generate(&state.db, &project_id, format, &output_dir).await?;

    let id = uuid::Uuid::new_v4().to_string();
    let title = format!("Report — {}", chrono::Utc::now().format("%Y-%m-%d %H:%M"));
    state.reports.create(&id, &project_id, &title, format.as_str(), &path.to_string_lossy(), content.as_deref()).await
}

#[tauri::command]
pub async fn list_reports(state: State<'_, AppState>, project_id: String) -> AppResult<Vec<ReportRecord>> {
    state.reports.list(&project_id).await
}

#[tauri::command]
pub async fn get_report(state: State<'_, AppState>, id: String) -> AppResult<Option<ReportRecord>> {
    state.reports.get(&id).await
}

#[tauri::command]
pub async fn delete_report(state: State<'_, AppState>, id: String) -> AppResult<()> {
    if let Some(path) = state.reports.delete(&id).await? {
        let _ = tokio::fs::remove_file(path).await;
    }
    Ok(())
}
