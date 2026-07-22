use tauri::{AppHandle, Manager, State};

use crate::error::AppResult;
use crate::security::backup;
use crate::state::AppState;

#[tauri::command]
pub async fn create_encrypted_backup(app: AppHandle, state: State<'_, AppState>, dest_path: String) -> AppResult<()> {
    let cache_dir = app.path().app_cache_dir().map_err(|e| crate::error::AppError::new("PATH_ERROR", e.to_string()))?;
    backup::backup_database(&state.db, &cache_dir.join("backup-tmp"), std::path::Path::new(&dest_path)).await
}

#[tauri::command]
pub async fn restore_encrypted_backup(app: AppHandle, source_path: String) -> AppResult<String> {
    // Decrypts into the app data dir as `restored.db` — the caller
    // (Settings > Storage UI) tells the user to restart the app pointed
    // at this file, since swapping the live, currently-open SQLite pool
    // out from under `AppState` at runtime isn't safe.
    let data_dir = app.path().app_data_dir().map_err(|e| crate::error::AppError::new("PATH_ERROR", e.to_string()))?;
    let dest = data_dir.join("restored.db");
    backup::decrypt_file(std::path::Path::new(&source_path), &dest).await?;
    Ok(dest.to_string_lossy().to_string())
}
