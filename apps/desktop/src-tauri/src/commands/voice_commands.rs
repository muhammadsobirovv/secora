use tauri::{AppHandle, Manager, State};

use crate::error::AppResult;
use crate::state::AppState;
use crate::voice::{VoiceBackendAvailability, VoiceSettings};

#[tauri::command]
pub async fn get_voice_settings(state: State<'_, AppState>) -> AppResult<VoiceSettings> {
    state.voice.get_settings().await
}

#[tauri::command]
pub async fn set_voice_settings(state: State<'_, AppState>, settings: VoiceSettings) -> AppResult<()> {
    state.voice.set_settings(&settings).await
}

#[tauri::command]
pub fn voice_backend_availability(state: State<'_, AppState>) -> VoiceBackendAvailability {
    state.voice.availability()
}

/// `audio_path` is a file already on disk — the frontend records via
/// `MediaRecorder` and writes the blob to a temp file (through the `fs`
/// plugin) before calling this, since Tauri's IPC isn't well suited to
/// streaming raw audio bytes.
#[tauri::command]
pub async fn transcribe_audio(state: State<'_, AppState>, audio_path: String) -> AppResult<String> {
    state.voice.transcribe(std::path::Path::new(&audio_path)).await
}

/// Synthesizes speech to a WAV file under the app's cache dir and returns
/// its path; the frontend plays it via `convertFileSrc(path)` in an
/// `<audio>` element.
#[tauri::command]
pub async fn synthesize_speech(app: AppHandle, state: State<'_, AppState>, text: String) -> AppResult<String> {
    let cache_dir = app.path().app_cache_dir().map_err(|e| crate::error::AppError::new("PATH_ERROR", e.to_string()))?;
    let output_path = cache_dir.join("voice").join(format!("{}.wav", uuid::Uuid::new_v4()));
    let path = state.voice.synthesize(&text, &output_path).await?;
    Ok(path.to_string_lossy().to_string())
}
