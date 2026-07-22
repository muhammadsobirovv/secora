use std::collections::HashMap;
use tauri::State;

use crate::state::AppState;

/// Settings > Tools page: which of the 16 registered tools currently
/// resolve on PATH.
#[tauri::command]
pub fn list_tools(state: State<AppState>) -> Vec<String> {
    state.tool_registry.list_names().into_iter().map(String::from).collect()
}

#[tauri::command]
pub fn tool_availability(state: State<AppState>) -> HashMap<String, bool> {
    state
        .tool_registry
        .availability()
        .into_iter()
        .map(|(k, v)| (k.to_string(), v))
        .collect()
}
