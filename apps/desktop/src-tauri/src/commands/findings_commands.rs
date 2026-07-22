use tauri::State;

use crate::error::AppResult;
use crate::state::AppState;
use crate::storage::repositories::findings::{FindingRecord, NewFinding};

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn create_finding(
    state: State<'_, AppState>,
    project_id: String,
    target_id: Option<String>,
    title: String,
    severity: String,
    url: Option<String>,
    description: Option<String>,
    evidence: Option<String>,
    tags: Option<Vec<String>>,
) -> AppResult<FindingRecord> {
    let id = uuid::Uuid::new_v4().to_string();
    let tags = tags.unwrap_or_default();
    state
        .findings
        .create(
            &id,
            NewFinding {
                project_id: &project_id,
                target_id: target_id.as_deref(),
                title: &title,
                severity: &severity,
                source: "MANUAL",
                url: url.as_deref(),
                description: description.as_deref(),
                evidence: evidence.as_deref(),
                tags: &tags,
            },
        )
        .await
}

#[tauri::command]
pub async fn list_findings(state: State<'_, AppState>, project_id: String) -> AppResult<Vec<FindingRecord>> {
    state.findings.list(&project_id).await
}

#[tauri::command]
pub async fn update_finding_status(state: State<'_, AppState>, id: String, status: String) -> AppResult<FindingRecord> {
    state.findings.update_status(&id, &status).await
}

#[tauri::command]
pub async fn delete_finding(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.findings.delete(&id).await
}
