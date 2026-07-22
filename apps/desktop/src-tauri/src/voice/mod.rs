//! Voice — Speech-to-Text and Text-to-Speech.
//!
//! Two backends per direction, selected in Settings > Voice:
//! - **Browser (Web Speech API)** — the default. `SpeechRecognition` for
//!   STT and `speechSynthesis` for TTS are webview-native APIs; there is
//!   no Rust involvement at all for this path, it's implemented entirely
//!   in `apps/desktop/src/features/voice` (push-to-talk, continuous
//!   listening, read-AI-responses-aloud, and voice interruption — barge-in
//!   by calling `speechSynthesis.cancel()` — all live there since they're
//!   pure webview API orchestration).
//! - **Local (whisper.cpp / Piper)** — fully offline, no data leaves the
//!   machine even to the OS's own speech service. `voice::whisper` and
//!   `voice::piper` shell out to user-installed binaries (same
//!   "resolve from PATH, clear error if missing" pattern as every
//!   recon/scanner tool), exposed via `commands::voice_commands`.

pub mod piper;
pub mod whisper;

use serde::{Deserialize, Serialize};

use crate::error::AppResult;
use crate::storage::repositories::settings::SettingsRepository;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SttBackend {
    WebSpeech,
    Whisper,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TtsBackend {
    WebSpeech,
    Piper,
}

impl Default for SttBackend {
    fn default() -> Self {
        SttBackend::WebSpeech
    }
}

impl Default for TtsBackend {
    fn default() -> Self {
        TtsBackend::WebSpeech
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceSettings {
    pub stt_backend: SttBackend,
    pub tts_backend: TtsBackend,
    pub whisper_model_path: Option<String>,
    pub piper_model_path: Option<String>,
    pub language: Option<String>,
    /// "hold-to-talk" (release stops recording) vs continuous listening
    /// with voice-activity-detection-driven turn-taking. Enforced entirely
    /// on the frontend; kept here so it round-trips through Settings.
    pub push_to_talk: bool,
    pub continuous_listening: bool,
    pub read_responses_aloud: bool,
    /// Whether starting a new TTS utterance should barge-in and cancel
    /// whatever's currently playing (vs queueing after it finishes).
    pub interrupt_on_new_message: bool,
    /// webview-native voice name for the WebSpeech TTS backend (populated
    /// from `speechSynthesis.getVoices()` on the frontend and just passed
    /// through here so it persists across restarts).
    pub web_speech_voice: Option<String>,
}

impl Default for VoiceSettings {
    fn default() -> Self {
        Self {
            stt_backend: SttBackend::default(),
            tts_backend: TtsBackend::default(),
            whisper_model_path: None,
            piper_model_path: None,
            language: None,
            push_to_talk: true,
            continuous_listening: false,
            read_responses_aloud: false,
            interrupt_on_new_message: true,
            web_speech_voice: None,
        }
    }
}

impl VoiceSettings {
    pub const SETTINGS_KEY: &'static str = "voice.settings";
}

#[derive(Debug, Clone, Serialize)]
pub struct VoiceBackendAvailability {
    pub whisper: bool,
    pub piper: bool,
}

pub struct VoiceService {
    settings: std::sync::Arc<SettingsRepository>,
}

impl VoiceService {
    pub fn new(settings: std::sync::Arc<SettingsRepository>) -> Self {
        Self { settings }
    }

    pub async fn get_settings(&self) -> AppResult<VoiceSettings> {
        Ok(self.settings.get(VoiceSettings::SETTINGS_KEY).await?.unwrap_or_default())
    }

    pub async fn set_settings(&self, settings: &VoiceSettings) -> AppResult<()> {
        self.settings.set(VoiceSettings::SETTINGS_KEY, settings).await
    }

    pub fn availability(&self) -> VoiceBackendAvailability {
        VoiceBackendAvailability { whisper: whisper::is_available(), piper: piper::is_available() }
    }

    pub async fn transcribe(&self, audio_path: &std::path::Path) -> AppResult<String> {
        let settings = self.get_settings().await?;
        let model = settings.whisper_model_path.ok_or_else(|| {
            crate::error::AppError::new("WHISPER_MODEL_NOT_CONFIGURED", "No whisper.cpp model configured in Settings > Voice.")
        })?;
        whisper::transcribe(audio_path, &model, settings.language.as_deref()).await
    }

    pub async fn synthesize(&self, text: &str, output_path: &std::path::Path) -> AppResult<std::path::PathBuf> {
        let settings = self.get_settings().await?;
        let model = settings.piper_model_path.ok_or_else(|| {
            crate::error::AppError::new("PIPER_MODEL_NOT_CONFIGURED", "No Piper voice model configured in Settings > Voice.")
        })?;
        piper::synthesize(text, &model, output_path).await
    }
}
