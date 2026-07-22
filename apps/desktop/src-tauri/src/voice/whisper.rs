//! Local speech-to-text via whisper.cpp. Only used when
//! `VoiceSettings.stt_backend == SttBackend::Whisper` — the default STT
//! path is the browser's Web Speech API (zero Rust involvement, see
//! `apps/desktop/src/features/voice`), so this is the offline fallback for
//! platforms/setups where Web Speech isn't available or the user wants a
//! fully local pipeline (no audio ever leaves the machine, not even to a
//! browser-vendor STT backend).

use std::path::Path;
use std::process::Stdio;
use tokio::process::Command;

use crate::error::{AppError, AppResult};

/// whisper.cpp has shipped its CLI binary under a few different names
/// across releases (`main` historically, `whisper-cli` in newer releases,
/// `whisper` for some package-manager builds) — try each on PATH in turn
/// rather than hard-coding one and forcing users to rename their binary.
const CANDIDATE_BINARIES: &[&str] = &["whisper-cli", "whisper-cpp", "whisper", "main"];

pub fn is_available() -> bool {
    resolve_binary().is_some()
}

fn resolve_binary() -> Option<std::path::PathBuf> {
    CANDIDATE_BINARIES.iter().find_map(|name| which::which(name).ok())
}

/// Transcribes a local audio file (WAV, 16kHz mono is whisper.cpp's native
/// format; other formats work if the binary was built with ffmpeg support,
/// which is the common case). Returns the plain-text transcript with
/// whisper.cpp's `[start --> end]` timestamp prefixes stripped.
pub async fn transcribe(audio_path: &Path, model_path: &str, language: Option<&str>) -> AppResult<String> {
    let bin = resolve_binary().ok_or_else(|| {
        AppError::new(
            "WHISPER_NOT_INSTALLED",
            "No whisper.cpp binary found on PATH (tried whisper-cli/whisper-cpp/whisper/main). Install whisper.cpp or switch Voice > Speech-to-Text to \"Browser (Web Speech API)\" in Settings.",
        )
    })?;

    if !Path::new(model_path).exists() {
        return Err(AppError::new(
            "WHISPER_MODEL_MISSING",
            format!("Whisper model not found at \"{model_path}\". Download a ggml model (e.g. ggml-base.en.bin) and set its path in Settings > Voice."),
        ));
    }

    let mut args: Vec<String> = vec![
        "-m".into(), model_path.to_string(),
        "-f".into(), audio_path.to_string_lossy().to_string(),
        "-nt".into(), // no timestamps in output — we want plain text
    ];
    if let Some(lang) = language {
        args.push("-l".into());
        args.push(lang.to_string());
    }

    let output = Command::new(bin)
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(AppError::from)?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::new("WHISPER_FAILED", format!("whisper.cpp exited with {}: {stderr}", output.status)));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let text: String = stdout
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with('['))
        .collect::<Vec<_>>()
        .join(" ");

    Ok(text.trim().to_string())
}
