//! Application-wide state, constructed once in `lib.rs::run()` and managed
//! by Tauri (`app.manage(state)`) so every command handler can pull it via
//! `tauri::State<AppState>`. Mirrors the backend's DI container in spirit
//! — one place that wires repositories, the ToolRegistry, and the JobQueue
//! together — but as a plain struct, since Tauri commands are free
//! functions, not injectable classes.

use std::sync::Arc;

use crate::ai::chat::ChatService;
use crate::ai::providers::ProviderRegistry;
use crate::ai::tools::ToolRegistry as AiToolRegistry;
use crate::plugins::PluginRegistry;
use crate::queue::JobQueue;
use crate::rag::RagIndex;
use crate::services::file_watcher::FileWatcherService;
use crate::services::tool_runner::ToolRegistry;
use crate::storage::repositories::evidence::EvidenceRepository;
use crate::storage::repositories::findings::FindingsRepository;
use crate::storage::repositories::jobs::JobsRepository;
use crate::storage::repositories::notes::NotesRepository;
use crate::storage::repositories::payloads::PayloadsRepository;
use crate::storage::repositories::projects::ProjectsRepository;
use crate::storage::repositories::reports::ReportsRepository;
use crate::storage::repositories::settings::SettingsRepository;
use crate::storage::repositories::targets::TargetsRepository;
use crate::sync::SyncEngine;
use crate::voice::VoiceService;

// `Clone` is intentional and cheap: every field is either an `Arc<..>`
// (repository/service handles shared across the whole app) or a
// `sqlx::SqlitePool` (itself internally `Arc`-backed connection-pool
// state) — so cloning `AppState` is just bumping a handful of refcounts,
// not copying data. This is what lets `bridge::state::BridgeState` hold
// its own independent `AppState` for Tokio tasks that run outside
// Tauri's `State<'_, AppState>` extractor (see that module's doc
// comment for why the Bridge Server needs this).
#[derive(Clone)]
pub struct AppState {
    pub db: sqlx::SqlitePool,
    pub projects: Arc<ProjectsRepository>,
    pub targets: Arc<TargetsRepository>,
    pub jobs: Arc<JobsRepository>,
    pub settings: Arc<SettingsRepository>,
    pub tool_registry: Arc<ToolRegistry>,
    pub job_queue: Arc<JobQueue>,
    pub ai_providers: Arc<ProviderRegistry>,
    pub chat: Arc<ChatService>,
    pub rag: Arc<RagIndex>,
    pub sync: Arc<SyncEngine>,
    pub voice: Arc<VoiceService>,
    pub evidence: Arc<EvidenceRepository>,
    pub notes: Arc<NotesRepository>,
    pub reports: Arc<ReportsRepository>,
    pub file_watcher: Arc<FileWatcherService>,
    pub plugins: Arc<PluginRegistry>,
    pub findings: Arc<FindingsRepository>,
    pub payloads: Arc<PayloadsRepository>,
    /// Set once, shortly after `AppState::new()` returns, when
    /// `lib.rs::run()`'s `setup()` finishes starting the Bridge Server
    /// (see `bridge::spawn`) — a `OnceLock` rather than a plain field
    /// because the Bridge Server needs an owned `AppState` clone to
    /// start, but its resulting port/token then need to be written back
    /// into *this* (the original, soon-to-be-Tauri-managed) `AppState`.
    /// `Arc<OnceLock<_>>` is what makes that write visible through every
    /// clone made before or after `set()` is called, since they all
    /// point at the same cell. `None`-shaped reads (via
    /// `bridge_commands::get_bridge_info`) before the bridge finishes
    /// starting are surfaced as a clear `BRIDGE_NOT_RUNNING` error rather
    /// than panicking.
    pub bridge: Arc<std::sync::OnceLock<crate::bridge::BridgeHandle>>,
}

impl AppState {
    pub async fn new(db_path: std::path::PathBuf, on_log: crate::queue::LogSink) -> anyhow::Result<Self> {
        let db = crate::storage::open(&db_path).await?;

        let projects = Arc::new(ProjectsRepository::new(db.clone()));
        let targets = Arc::new(TargetsRepository::new(db.clone()));
        let jobs = Arc::new(JobsRepository::new(db.clone()));
        let settings = Arc::new(SettingsRepository::new(db.clone()));

        let mut registry = ToolRegistry::new();
        crate::recon::register_all(&mut registry);
        crate::scanner::register_all(&mut registry);
        let tool_registry = Arc::new(registry);

        let concurrency: usize = settings.get("jobs.concurrency").await.ok().flatten().unwrap_or(3);
        let job_queue = Arc::new(JobQueue::new(jobs.clone(), tool_registry.clone(), concurrency, on_log));
        job_queue.recover().await?;
        job_queue.clone().spawn_dispatcher(targets.clone());

        let ai_providers = Arc::new(ProviderRegistry::new(db.clone()));
        let ai_tools = Arc::new(AiToolRegistry::new());
        let chat = Arc::new(ChatService::new(db.clone(), ai_providers.clone(), ai_tools));

        // Local RAG opens a second SQLite connection to the same file (WAL
        // mode makes this safe alongside the sqlx pool). A full reindex on
        // every startup is cheap at desktop data volumes and guarantees the
        // FTS5 index never drifts even if a previous shutdown was unclean;
        // failures are logged, not fatal — search degrading to "empty" is
        // far better than the whole app failing to start.
        let rag = Arc::new(RagIndex::open(&db_path)?);
        if let Err(e) = crate::rag::indexer::reindex_all(&db, &rag).await {
            eprintln!("Local RAG: startup reindex failed (search may be incomplete): {e}");
        }

        // Sync Engine defaults to `SyncMode::Off` (see `sync::SyncConfig`'s
        // `Default` impl) until the user opts in via Settings > Sync, so
        // starting the background loop unconditionally is safe — most
        // cycles are a cheap early-return no-op.
        let sync = Arc::new(SyncEngine::new(db.clone(), settings.clone()).await?);
        sync.clone().spawn_background();

        let voice = Arc::new(VoiceService::new(settings.clone()));

        let evidence = Arc::new(EvidenceRepository::new(db.clone()));
        let notes = Arc::new(NotesRepository::new(db.clone(), Some(rag.clone())));
        let reports = Arc::new(ReportsRepository::new(db.clone()));

        // Folder Watch auto-imports new files into the Evidence Library.
        // The `notify` callback is synchronous and runs off the async
        // runtime, so it just hands the (project_id, path) pair to a
        // spawned task that does the real async import work (hash + MIME
        // sniff + DB insert) — same "sync callback bridges into async via
        // spawn" pattern as the Job Queue's log sink.
        let evidence_for_watch = evidence.clone();
        let on_new_file: crate::services::file_watcher::ImportCallback = Arc::new(move |project_id: String, path: std::path::PathBuf| {
            let evidence = evidence_for_watch.clone();
            tauri::async_runtime::spawn(async move {
                let Ok(sha256) = crate::services::hashing::sha256_file(&path).await else { return };
                let Ok(metadata) = tokio::fs::metadata(&path).await else { return };
                let file_name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
                let mime = crate::services::hashing::guess_mime_type(&path);
                let id = uuid::Uuid::new_v4().to_string();
                let tags = vec!["auto-imported".to_string()];
                if let Err(e) = evidence
                    .create(&id, &project_id, &file_name, &path.to_string_lossy(), mime, metadata.len() as i64, &sha256, &tags)
                    .await
                {
                    eprintln!("Folder Watch: failed to auto-import {}: {e}", path.display());
                }
            });
        });
        let file_watcher = Arc::new(FileWatcherService::new(on_new_file));

        let plugins = Arc::new(PluginRegistry::new(db.clone()));
        let findings = Arc::new(FindingsRepository::new(db.clone()));
        let payloads = Arc::new(PayloadsRepository::new(db.clone()));
        let bridge = Arc::new(std::sync::OnceLock::new());

        Ok(Self {
            db,
            projects,
            targets,
            jobs,
            settings,
            tool_registry,
            job_queue,
            ai_providers,
            chat,
            rag,
            sync,
            voice,
            evidence,
            notes,
            reports,
            file_watcher,
            plugins,
            findings,
            payloads,
            bridge,
        })
    }
}
