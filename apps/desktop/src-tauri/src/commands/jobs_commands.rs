use tauri::State;
use uuid::Uuid;

use crate::error::AppResult;
use crate::state::AppState;
use crate::storage::repositories::jobs::JobRecord;

/// `kind` is `"RECON"` or `"SCAN"`, `tool` is a `ToolRunner::name()`
/// (e.g. `"SUBFINDER"`, `"NUCLEI"`). Returns the new job's id immediately
/// — the job runs asynchronously; the frontend subscribes to
/// `job://{id}/log` Tauri events and polls/`get_job` for status.
#[tauri::command]
pub async fn run_tool_job(
    state: State<'_, AppState>,
    kind: String,
    tool: String,
    target_id: String,
    project_id: String,
    priority: Option<i64>,
    timeout_seconds: Option<i64>,
) -> AppResult<String> {
    let id = Uuid::new_v4().to_string();
    state
        .job_queue
        .enqueue(
            &id,
            &kind,
            &tool,
            &target_id,
            &project_id,
            priority.unwrap_or(0),
            timeout_seconds.unwrap_or(600),
        )
        .await?;
    Ok(id)
}

#[tauri::command]
pub async fn get_job(state: State<'_, AppState>, id: String) -> AppResult<Option<JobRecord>> {
    state.jobs.get(&id).await
}

#[tauri::command]
pub async fn list_jobs(state: State<'_, AppState>, project_id: String) -> AppResult<Vec<JobRecord>> {
    state.jobs.list_by_project(&project_id).await
}

#[tauri::command]
pub async fn cancel_job(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.job_queue.cancel(&id).await
}

#[tauri::command]
pub async fn pause_job(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.job_queue.pause(&id).await
}

#[tauri::command]
pub async fn resume_job(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.job_queue.resume(&id).await
}
