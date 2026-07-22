//! File Manager / Evidence Library commands. Drag & drop is handled on the
//! frontend (Tauri's webview emits a native drop event with the dropped
//! files' absolute paths — see `apps/desktop/src/features/files`), which
//! then calls `import_evidence` per file, same path as a manual "Import"
//! button click. Screenshot capture uses the browser's
//! `getDisplayMedia`/canvas APIs on the frontend (no OS-level screenshot
//! crate needed) and saves the resulting PNG blob to a temp file before
//! calling `import_evidence` — so screenshots are just evidence tagged
//! `"screenshot"`, not a separate subsystem. File preview is a frontend
//! concern too (`convertFileSrc` + `<img>`/`<iframe>`/syntax-highlighted
//! `<pre>` depending on `mime_type`).

use tauri::{AppHandle, Manager, State};

use crate::error::AppResult;
use crate::services::hashing;
use crate::state::AppState;
use crate::storage::repositories::evidence::{DuplicateGroup, EvidenceRecord};

#[tauri::command]
pub async fn import_evidence(
    app: AppHandle,
    state: State<'_, AppState>,
    project_id: String,
    source_path: String,
    tags: Vec<String>,
) -> AppResult<EvidenceRecord> {
    let source = std::path::Path::new(&source_path);
    let file_name = source
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .ok_or_else(|| crate::error::AppError::new("INVALID_PATH", "Source path has no file name."))?;

    let data_dir = app.path().app_data_dir().map_err(|e| crate::error::AppError::new("PATH_ERROR", e.to_string()))?;
    let dest_dir = data_dir.join("evidence").join(&project_id);
    tokio::fs::create_dir_all(&dest_dir).await.map_err(crate::error::AppError::from)?;

    let id = uuid::Uuid::new_v4().to_string();
    let dest_path = dest_dir.join(format!("{id}-{file_name}"));
    tokio::fs::copy(source, &dest_path).await.map_err(crate::error::AppError::from)?;

    let metadata = tokio::fs::metadata(&dest_path).await.map_err(crate::error::AppError::from)?;
    let sha256 = hashing::sha256_file(&dest_path).await?;
    let mime_type = hashing::guess_mime_type(&dest_path);

    state
        .evidence
        .create(&id, &project_id, &file_name, &dest_path.to_string_lossy(), mime_type, metadata.len() as i64, &sha256, &tags)
        .await
}

#[tauri::command]
pub async fn list_evidence(state: State<'_, AppState>, project_id: String) -> AppResult<Vec<EvidenceRecord>> {
    state.evidence.list(&project_id).await
}

#[tauri::command]
pub async fn find_duplicate_evidence(state: State<'_, AppState>, project_id: String) -> AppResult<Vec<DuplicateGroup>> {
    state.evidence.find_duplicates(&project_id).await
}

#[tauri::command]
pub async fn update_evidence_tags(state: State<'_, AppState>, id: String, tags: Vec<String>) -> AppResult<()> {
    state.evidence.update_tags(&id, &tags).await
}

#[tauri::command]
pub async fn delete_evidence(state: State<'_, AppState>, id: String) -> AppResult<()> {
    if let Some(file_path) = state.evidence.delete(&id).await? {
        let _ = tokio::fs::remove_file(file_path).await;
    }
    Ok(())
}

#[tauri::command]
pub async fn start_folder_watch(state: State<'_, AppState>, project_id: String, folder: String) -> AppResult<()> {
    state.file_watcher.start_watch(&project_id, std::path::Path::new(&folder)).await
}

#[tauri::command]
pub async fn stop_folder_watch(state: State<'_, AppState>, project_id: String, folder: String) -> AppResult<()> {
    state.file_watcher.stop_watch(&project_id, std::path::Path::new(&folder)).await
}

#[tauri::command]
pub async fn list_folder_watches(state: State<'_, AppState>, project_id: String) -> AppResult<Vec<String>> {
    Ok(state.file_watcher.list_watches(&project_id).await)
}
