//! Subprocess spawning for every local tool runner (recon + scanner).
//! Mirrors `apps/api/src/modules/recon/tool-runners/process/spawn-tool-process.util.ts`
//! exactly on purpose: argv array only (never a shell string — target
//! values are user-supplied and must never be interpolated into a shell
//! command), line-buffered stdout/stderr streaming via a callback, and
//! cancellation via `tokio_util::sync::CancellationToken` escalating from
//! SIGTERM-equivalent (child.kill()) after a grace period. Windows has no
//! POSIX signals, so "graceful stop" there is best-effort (Tauri's
//! `Child::kill` maps to `TerminateProcess`); the grace period still
//! bounds how long we wait before giving up.

use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::time::timeout;
use tokio_util::sync::CancellationToken;

use crate::error::{AppError, AppResult};

pub struct ToolRunResult {
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub timed_out: bool,
    pub cancelled: bool,
}

pub struct SpawnOptions<'a> {
    pub command: &'a str,
    pub args: &'a [String],
    pub cwd: Option<&'a std::path::Path>,
    pub timeout_seconds: u64,
    pub cancel: CancellationToken,
    pub kill_grace: Duration,
}

/// Runs `command args…`, capturing stdout in full (returned to the caller
/// for JSON/line parsing by the tool's Normalizer) while streaming both
/// stdout and stderr line-by-line through `on_line` for live progress
/// events (forwarded to the frontend via a Tauri event, same idea as the
/// backend's SSE recon job logs).
pub async fn spawn_tool<F>(opts: SpawnOptions<'_>, mut on_line: F) -> AppResult<ToolRunResult>
where
    F: FnMut(bool, &str) + Send,
{
    let bin = which::which(opts.command)
        .map_err(|_| AppError::tool_binary_missing(opts.command))?;

    let mut cmd = Command::new(bin);
    cmd.args(opts.args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(cwd) = opts.cwd {
        cmd.current_dir(cwd);
    }

    let mut child: Child = cmd.spawn().map_err(AppError::from)?;
    let stdout = child.stdout.take().expect("stdout piped");
    let stderr = child.stderr.take().expect("stderr piped");

    let mut stdout_lines = BufReader::new(stdout).lines();
    let mut stderr_lines = BufReader::new(stderr).lines();
    let mut full_stdout = String::new();
    let mut timed_out = false;
    let mut cancelled = false;

    let run = async {
        loop {
            tokio::select! {
                line = stdout_lines.next_line() => {
                    match line {
                        Ok(Some(l)) => {
                            full_stdout.push_str(&l);
                            full_stdout.push('\n');
                            on_line(false, &l);
                        }
                        Ok(None) => break,
                        Err(_) => break,
                    }
                }
                line = stderr_lines.next_line() => {
                    if let Ok(Some(l)) = line {
                        on_line(true, &l);
                    }
                }
                _ = opts.cancel.cancelled() => {
                    cancelled = true;
                    break;
                }
            }
        }
    };

    match timeout(Duration::from_secs(opts.timeout_seconds), run).await {
        Ok(()) => {}
        Err(_) => timed_out = true,
    }

    if timed_out || cancelled {
        let _ = child.start_kill();
        let _ = timeout(opts.kill_grace, child.wait()).await;
    }

    let exit_code = match child.try_wait() {
        Ok(Some(status)) => status.code(),
        _ => {
            let _ = child.kill().await;
            None
        }
    };

    Ok(ToolRunResult {
        exit_code,
        stdout: full_stdout,
        timed_out,
        cancelled,
    })
}
