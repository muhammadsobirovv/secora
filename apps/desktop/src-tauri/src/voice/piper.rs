//! Local text-to-speech via Piper (https://github.com/rhasspy/piper).
//! Fallback path for `TtsBackend::Piper` — the default is the browser's
//! `speechSynthesis` API (zero Rust involvement, `apps/desktop/src/features/voice`).
//! Piper reads text on stdin and writes a WAV file, which the frontend
//! then plays via an `<audio>` element (Tauri's `convertFileSrc`).

use std::path::{Path, PathBuf};
use std::process::Stdio;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;

use crate::error::{AppError, AppResult};

pub fn is_available() -> bool {
    which::which("piper").is_ok()
}

/// Synthesizes `text` to a WAV file at `output_path` using the given Piper
/// voice model (a `.onnx` file downloaded separately — Piper voices are
/// per-language/per-speaker, so the path is user-configured in Settings >
/// Voice, not bundled with the app).
pub async fn synthesize(text: &str, model_path: &str, output_path: &Path) -> AppResult<PathBuf> {
    let bin = which::which("piper").map_err(|_| {
        AppError::new(
            "PIPER_NOT_INSTALLED",
            "Piper binary not found on PATH. Install Piper or switch Voice > Text-to-Speech to \"Browser (Web Speech API)\" in Settings.",
        )
    })?;

    if !Path::new(model_path).exists() {
        return Err(AppError::new(
            "PIPER_MODEL_MISSING",
            format!("Piper voice model not found at \"{model_path}\". Download a voice (.onnx + .onnx.json) and set its path in Settings > Voice."),
        ));
    }

    if let Some(parent) = output_path.parent() {
        tokio::fs::create_dir_all(parent).await.map_err(AppError::from)?;
    }

    let mut child = Command::new(bin)
        .args(["--model", model_path, "--output_file", &output_path.to_string_lossy()])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(AppError::from)?;

    {
        let stdin = child.stdin.as_mut().expect("stdin piped");
        stdin.write_all(text.as_bytes()).await.map_err(AppError::from)?;
    }
    // Dropping the write half here would require restructuring to scope
    // `stdin` out before `wait_with_output`; take() achieves the same EOF
    // signal Piper needs to know the input is complete.
    child.stdin.take();

    let output = child.wait_with_output().await.map_err(AppError::from)?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::new("PIPER_FAILED", format!("Piper exited with {}: {stderr}", output.status)));
    }

    Ok(output_path.to_path_buf())
}
