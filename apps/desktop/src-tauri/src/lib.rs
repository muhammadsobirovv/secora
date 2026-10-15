pub mod ai;
pub mod bridge;
pub mod commands;
pub mod error;
pub mod ipc;
pub mod plugins;
pub mod queue;
pub mod rag;
pub mod recon;
pub mod reports;
pub mod scanner;
pub mod security;
pub mod services;
pub mod state;
pub mod storage;
pub mod sync;
pub mod voice;

use std::sync::Arc;
use tauri::{Emitter, Manager};

use state::AppState;

/// Tauri's generated entry point — called from `main.rs`. Builds the
/// window, wires plugins, constructs `AppState` (opening/migrating the
/// SQLite DB and starting the Job Queue dispatcher), and registers every
/// `#[tauri::command]` so the frontend can call them via `invoke()`.
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let handle = app.handle().clone();
            let db_path = app
                .path()
                .app_data_dir()
                .expect("app data dir resolvable")
                .join("pentesthub.db");

            tauri::async_runtime::block_on(async move {
                let log_handle = handle.clone();
                let on_log: queue::LogSink = Arc::new(move |job_id, level, message| {
                    let level_str = match level {
                        services::tool_runner::LogLevel::Info => "INFO",
                        services::tool_runner::LogLevel::Warn => "WARN",
                        services::tool_runner::LogLevel::Error => "ERROR",
                    };
                    let _ = log_handle.emit(
                        &ipc::event_name(ipc::EventScheme::Job, &job_id, "log"),
                        serde_json::json!({ "level": level_str, "message": message }),
                    );
                });

                match AppState::new(db_path, on_log).await {
                    Ok(state) => {
                        // Module 8: start the Local Bridge Server on a
                        // clone of `AppState` (see `state::AppState`'s
                        // `Clone` doc comment and `bridge::mod`'s doc
                        // comment for why it needs its own copy rather
                        // than reaching into Tauri's managed state).
                        // Failure here is logged, not fatal — the
                        // desktop app is fully usable without the
                        // Browser Extension / Burp integration, it just
                        // won't be reachable from them until the next
                        // restart (see `bridge_commands::
                        // get_bridge_info`'s `BRIDGE_NOT_RUNNING` error).
                        let bridge_app_state = state.clone();
                        let bridge_data_dir = app.path().app_data_dir().expect("app data dir resolvable");
                        let bridge_cell = state.bridge.clone();
                        match bridge::spawn(bridge_app_state, bridge_data_dir).await {
                            Ok(handle) => {
                                eprintln!("Bridge Server listening on http://127.0.0.1:{}", handle.port);
                                let _ = bridge_cell.set(handle);
                            }
                            Err(e) => {
                                eprintln!("Bridge Server failed to start (Browser Extension / Burp integration unavailable): {e}");
                            }
                        }

                        handle.manage(state);
                    }
                    Err(e) => {
                        eprintln!("Failed to initialize AppState: {e}");
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::projects_commands::create_project,
            commands::projects_commands::list_projects,
            commands::projects_commands::delete_project,
            commands::projects_commands::create_target,
            commands::projects_commands::list_targets,
            commands::jobs_commands::run_tool_job,
            commands::jobs_commands::get_job,
            commands::jobs_commands::list_jobs,
            commands::jobs_commands::cancel_job,
            commands::jobs_commands::pause_job,
            commands::jobs_commands::resume_job,
            commands::tools_commands::list_tools,
            commands::tools_commands::tool_availability,
            commands::ai_commands::list_ai_providers,
            commands::ai_commands::save_ai_provider_credential,
            commands::ai_commands::delete_ai_provider_credential,
            commands::ai_commands::create_conversation,
            commands::ai_commands::list_conversations,
            commands::ai_commands::get_conversation,
            commands::ai_commands::list_messages,
            commands::ai_commands::pin_conversation,
            commands::ai_commands::delete_conversation,
            commands::ai_commands::send_message,
            commands::ai_commands::cancel_generation,
            commands::rag_commands::search_rag,
            commands::rag_commands::reindex_rag,
            commands::rag_commands::reindex_rag_embeddings,
            commands::sync_commands::get_sync_config,
            commands::sync_commands::set_sync_mode,
            commands::sync_commands::set_sync_connection,
            commands::sync_commands::disconnect_sync,
            commands::sync_commands::set_sync_workspace,
            commands::sync_commands::test_sync_connection,
            commands::sync_commands::sync_now,
            commands::sync_commands::list_sync_retry_queue,
            commands::sync_commands::list_sync_conflicts,
            commands::sync_commands::resolve_sync_conflict,
            commands::voice_commands::get_voice_settings,
            commands::voice_commands::set_voice_settings,
            commands::voice_commands::voice_backend_availability,
            commands::voice_commands::transcribe_audio,
            commands::voice_commands::synthesize_speech,
            commands::evidence_commands::import_evidence,
            commands::evidence_commands::list_evidence,
            commands::evidence_commands::find_duplicate_evidence,
            commands::evidence_commands::update_evidence_tags,
            commands::evidence_commands::delete_evidence,
            commands::evidence_commands::start_folder_watch,
            commands::evidence_commands::stop_folder_watch,
            commands::evidence_commands::list_folder_watches,
            commands::notes_commands::create_note,
            commands::notes_commands::update_note,
            commands::notes_commands::list_notes,
            commands::notes_commands::get_note,
            commands::notes_commands::delete_note,
            commands::reports_commands::generate_report,
            commands::reports_commands::list_reports,
            commands::reports_commands::get_report,
            commands::reports_commands::delete_report,
            commands::plugin_commands::list_plugin_templates,
            commands::plugin_commands::list_plugins,
            commands::plugin_commands::install_plugin,
            commands::plugin_commands::set_plugin_enabled,
            commands::plugin_commands::uninstall_plugin,
            commands::plugin_commands::run_plugin,
            commands::security_commands::create_encrypted_backup,
            commands::security_commands::restore_encrypted_backup,
            commands::findings_commands::create_finding,
            commands::findings_commands::list_findings,
            commands::findings_commands::update_finding_status,
            commands::findings_commands::delete_finding,
            commands::bridge_commands::get_bridge_info,
            commands::bridge_commands::regenerate_bridge_token,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Secora AI Desktop");
}
