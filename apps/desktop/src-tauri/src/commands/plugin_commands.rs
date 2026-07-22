use tauri::{AppHandle, Emitter, State};
use tokio_util::sync::CancellationToken;

use crate::error::AppResult;
use crate::plugins::{InstalledPlugin, PluginManifest};
use crate::state::AppState;

#[tauri::command]
pub fn list_plugin_templates() -> Vec<(String, PluginManifest)> {
    crate::plugins::builtin_templates().into_iter().map(|(name, manifest)| (name.to_string(), manifest)).collect()
}

#[tauri::command]
pub async fn list_plugins(state: State<'_, AppState>) -> AppResult<Vec<InstalledPlugin>> {
    state.plugins.list().await
}

#[tauri::command]
pub async fn install_plugin(state: State<'_, AppState>, name: String, version: String, manifest: PluginManifest) -> AppResult<InstalledPlugin> {
    state.plugins.install(&name, &version, manifest).await
}

#[tauri::command]
pub async fn set_plugin_enabled(state: State<'_, AppState>, id: String, enabled: bool) -> AppResult<()> {
    state.plugins.set_enabled(&id, enabled).await
}

#[tauri::command]
pub async fn uninstall_plugin(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.plugins.uninstall(&id).await
}

/// Runs a plugin against `target`, streaming output lines as
/// `plugin://{id}/log` events — same "subscribe first, then invoke"
/// pattern as job logs (`job://{id}/log`) and chat streaming
/// (`ai://{id}/stream`).
#[tauri::command]
pub async fn run_plugin(app: AppHandle, state: State<'_, AppState>, id: String, target: String, project_name: String) -> AppResult<String> {
    let log_event_name = crate::ipc::event_name(crate::ipc::EventScheme::Plugin, &id, "log");
    let emit_handle = app.clone();
    let cancel = CancellationToken::new();

    let result = state
        .plugins
        .run(&id, &target, &project_name, cancel, |is_stderr, line| {
            let _ = emit_handle.emit(&log_event_name, serde_json::json!({ "stderr": is_stderr, "line": line }));
        })
        .await?;

    Ok(result.stdout)
}
