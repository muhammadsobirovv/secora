//! The shared execution-engine contract every recon/scanner tool adapter
//! implements. Mirrors `apps/api/.../recon/tool-runners/tool-runner.interface.ts`
//! and its vuln-module twin (`scanner-runners/scanner-runner.interface.ts`)
//! one-to-one: feature code never spawns a binary directly, only asks a
//! `ToolRegistry` for a `ToolRunner` by name and calls `.run()`. Unlike the
//! backend (one runner set, since it alone executed tools pre-Module-7),
//! the Desktop Agent's registry is generic over *both* recon and scanner
//! tools — see `recon::register_all` / `scanner::register_all` — because
//! the spec treats "Local Tool Runner" as one system spanning all 16+
//! tools rather than two.

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio_util::sync::CancellationToken;

use crate::error::AppResult;
use crate::services::tool_process::{spawn_tool, SpawnOptions};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TargetType {
    Domain,
    Subdomain,
    IpAddress,
    Cidr,
    Url,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolTarget {
    pub id: String,
    #[serde(rename = "type")]
    pub target_type: TargetType,
    pub value: String,
}

/// One line of tool output, forwarded to the frontend as a Tauri event
/// (`job://{job_id}/log`) as it streams — this is what the Live Logs panel
/// in the desktop UI subscribes to, same UX as the web app's SSE recon log
/// view but over Tauri's native event bus instead of HTTP.
#[derive(Debug, Clone, Serialize)]
pub struct ToolLogLine {
    pub job_id: String,
    pub level: LogLevel,
    pub message: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum LogLevel {
    Info,
    Warn,
    Error,
}

pub struct RunContext {
    pub job_id: String,
    pub target: ToolTarget,
    pub timeout_seconds: u64,
    pub cancel: CancellationToken,
    pub on_log: Box<dyn Fn(LogLevel, String) + Send + Sync>,
}

#[derive(Debug, Clone, Serialize)]
pub struct RunOutcome {
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub timed_out: bool,
    pub cancelled: bool,
}

/// Implemented once per CLI tool. `run()` builds the argv for this
/// specific target and delegates process spawning/streaming/cancellation
/// to `services::tool_process::spawn_tool` — adapters never touch
/// `std::process`/`tokio::process` directly, matching the backend
/// convention of centralizing subprocess handling in exactly one place.
#[async_trait]
pub trait ToolRunner: Send + Sync {
    fn name(&self) -> &'static str;
    fn binary(&self) -> &'static str;
    fn supported_target_types(&self) -> &'static [TargetType];
    fn default_timeout_seconds(&self) -> u64 {
        600
    }
    fn build_args(&self, target: &ToolTarget) -> Vec<String>;

    async fn run(&self, ctx: RunContext) -> AppResult<RunOutcome> {
        let args = self.build_args(&ctx.target);
        let result = spawn_tool(
            SpawnOptions {
                command: self.binary(),
                args: &args,
                cwd: None,
                timeout_seconds: ctx.timeout_seconds,
                cancel: ctx.cancel.clone(),
                kill_grace: std::time::Duration::from_secs(5),
            },
            |is_stderr, line| {
                let level = if is_stderr { LogLevel::Warn } else { LogLevel::Info };
                (ctx.on_log)(level, line.to_string());
            },
        )
        .await?;

        Ok(RunOutcome {
            exit_code: result.exit_code,
            stdout: result.stdout,
            timed_out: result.timed_out,
            cancelled: result.cancelled,
        })
    }
}

/// Resolves a `ToolRunner` by name — the one seam all recon/scan job
/// execution goes through. `register_all()` in `recon::adapters` and
/// `scanner::adapters` populate this at startup (see `AppState::new`).
#[derive(Default)]
pub struct ToolRegistry {
    runners: HashMap<&'static str, Arc<dyn ToolRunner>>,
}

impl ToolRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register(&mut self, runner: Arc<dyn ToolRunner>) {
        self.runners.insert(runner.name(), runner);
    }

    pub fn get(&self, name: &str) -> Option<Arc<dyn ToolRunner>> {
        self.runners.get(name).cloned()
    }

    pub fn list_names(&self) -> Vec<&'static str> {
        self.runners.keys().copied().collect()
    }

    /// Whether every registered tool's binary is currently resolvable on
    /// PATH — powers the Settings > Tools page's per-tool status badges.
    pub fn availability(&self) -> HashMap<&'static str, bool> {
        self.runners
            .iter()
            .map(|(name, runner)| (*name, which::which(runner.binary()).is_ok()))
            .collect()
    }
}
