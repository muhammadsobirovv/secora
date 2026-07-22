//! Background Job Queue — Queued/Running/Paused/Completed/Failed/
//! Cancelled, retry, priority, concurrent jobs, heartbeat, crash recovery,
//! resume. `JobQueue` owns a `tokio::sync::Semaphore` sized to the
//! configured concurrency limit; a dispatcher loop claims the next queued
//! job (persisted via `JobsRepository`, so a crash mid-run is recoverable
//! — see `recover_stale_running`) and hands it to `ToolRegistry` for
//! execution, streaming logs out as Tauri events and heartbeating every
//! few seconds so `recover_stale_running` can tell "still running" apart
//! from "process died".

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{Mutex, Semaphore};
use tokio_util::sync::CancellationToken;

use crate::error::{AppError, AppResult};
use crate::services::tool_runner::{LogLevel, RunContext, ToolRegistry, ToolTarget};
use crate::storage::repositories::jobs::JobsRepository;

const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(5);
const STALE_AFTER_SECONDS: i64 = 60;

pub type LogSink = Arc<dyn Fn(String, LogLevel, String) + Send + Sync>;

pub struct JobQueue {
    repo: Arc<JobsRepository>,
    registry: Arc<ToolRegistry>,
    semaphore: Arc<Semaphore>,
    cancellations: Arc<Mutex<HashMap<String, CancellationToken>>>,
    on_log: LogSink,
}

impl JobQueue {
    pub fn new(repo: Arc<JobsRepository>, registry: Arc<ToolRegistry>, concurrency: usize, on_log: LogSink) -> Self {
        Self {
            repo,
            registry,
            semaphore: Arc::new(Semaphore::new(concurrency.max(1))),
            cancellations: Arc::new(Mutex::new(HashMap::new())),
            on_log,
        }
    }

    /// Crash Recovery — call once at startup before the dispatcher loop
    /// starts, so jobs orphaned by a previous unclean shutdown go back to
    /// QUEUED instead of sitting in RUNNING forever.
    pub async fn recover(&self) -> AppResult<u64> {
        self.repo.recover_stale_running(STALE_AFTER_SECONDS).await
    }

    pub async fn enqueue(
        &self,
        id: &str,
        kind: &str,
        tool: &str,
        target_id: &str,
        project_id: &str,
        priority: i64,
        timeout_seconds: i64,
    ) -> AppResult<()> {
        if self.registry.get(tool).is_none() {
            return Err(AppError::tool_not_found(tool));
        }
        self.repo
            .enqueue(id, kind, tool, target_id, project_id, priority, timeout_seconds)
            .await
    }

    pub async fn cancel(&self, job_id: &str) -> AppResult<()> {
        if let Some(token) = self.cancellations.lock().await.get(job_id) {
            token.cancel();
        }
        self.repo.cancel(job_id).await
    }

    pub async fn pause(&self, job_id: &str) -> AppResult<()> {
        self.repo.pause(job_id).await
    }

    pub async fn resume(&self, job_id: &str) -> AppResult<()> {
        self.repo.resume(job_id).await
    }

    /// The dispatcher — spawned once as a long-lived Tokio task from
    /// `main.rs`. Polls for the next queued job, acquires a concurrency
    /// permit, and executes it on its own task so multiple jobs run in
    /// parallel up to the semaphore's limit.
    pub fn spawn_dispatcher(self: Arc<Self>, target_resolver: Arc<dyn TargetResolver>) {
        tokio::spawn(async move {
            loop {
                match self.repo.claim_next().await {
                    Ok(Some(job)) => {
                        let permit = self.semaphore.clone().acquire_owned().await;
                        let Ok(permit) = permit else { continue };
                        let this = self.clone();
                        let resolver = target_resolver.clone();
                        tokio::spawn(async move {
                            this.execute(job, resolver).await;
                            drop(permit);
                        });
                    }
                    Ok(None) => {
                        tokio::time::sleep(Duration::from_millis(1500)).await;
                    }
                    Err(_) => {
                        tokio::time::sleep(Duration::from_secs(3)).await;
                    }
                }
            }
        });
    }

    async fn execute(&self, job: crate::storage::repositories::jobs::JobRecord, resolver: Arc<dyn TargetResolver>) {
        let Some(runner) = self.registry.get(&job.tool) else {
            let _ = self.repo.fail_or_retry(&job.id, "Tool no longer registered").await;
            return;
        };

        let Ok(target_value) = resolver.resolve(&job.target_id).await else {
            let _ = self.repo.fail_or_retry(&job.id, "Target not found").await;
            return;
        };

        let cancel = CancellationToken::new();
        self.cancellations.lock().await.insert(job.id.clone(), cancel.clone());

        // Heartbeat loop — keeps recover_stale_running from reclaiming a
        // job that's genuinely still running.
        let hb_repo = self.repo.clone();
        let hb_job_id = job.id.clone();
        let hb_cancel = cancel.clone();
        let heartbeat = tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = tokio::time::sleep(HEARTBEAT_INTERVAL) => {
                        let _ = hb_repo.heartbeat(&hb_job_id).await;
                    }
                    _ = hb_cancel.cancelled() => break,
                }
            }
        });

        let on_log = self.on_log.clone();
        let job_id_for_log = job.id.clone();
        let repo_for_log = self.repo.clone();
        let job_id_for_log2 = job.id.clone();

        let ctx = RunContext {
            job_id: job.id.clone(),
            target: ToolTarget {
                id: job.target_id.clone(),
                target_type: target_value.target_type,
                value: target_value.value,
            },
            timeout_seconds: job.timeout_seconds as u64,
            cancel: cancel.clone(),
            on_log: Box::new(move |level, message| {
                on_log(job_id_for_log.clone(), level, message.clone());
                let repo = repo_for_log.clone();
                let jid = job_id_for_log2.clone();
                let lvl = match level {
                    LogLevel::Info => "INFO",
                    LogLevel::Warn => "WARN",
                    LogLevel::Error => "ERROR",
                };
                tokio::spawn(async move {
                    let _ = repo.append_log(&jid, lvl, &message).await;
                });
            }),
        };

        let outcome = runner.run(ctx).await;
        cancel.cancel();
        heartbeat.abort();
        self.cancellations.lock().await.remove(&job.id);

        match outcome {
            Ok(result) if result.cancelled => {
                let _ = self.repo.cancel(&job.id).await;
            }
            Ok(result) if result.timed_out => {
                let _ = self.repo.fail_or_retry(&job.id, "Timed out").await;
            }
            Ok(result) => {
                let _ = self
                    .repo
                    .complete(&job.id, result.exit_code.map(|c| c as i64), &result.stdout)
                    .await;
            }
            Err(e) => {
                let _ = self.repo.fail_or_retry(&job.id, &e.message).await;
            }
        }
    }
}

pub struct ResolvedTarget {
    pub target_type: crate::services::tool_runner::TargetType,
    pub value: String,
}

/// Decouples `JobQueue` from `storage::repositories::projects`'s target
/// table shape — the queue only needs "given a target id, what's its
/// type/value", not the full Targets repository surface.
#[async_trait::async_trait]
pub trait TargetResolver: Send + Sync {
    async fn resolve(&self, target_id: &str) -> AppResult<ResolvedTarget>;
}
