-- PentestHub AI Desktop Agent — local SQLite schema (Module 7).
-- Mirrors the shape of the backend's Prisma models (apps/api/prisma/schema.prisma)
-- closely enough that the Sync Engine's Metadata-Only tier can map rows
-- 1:1 without a translation layer, while staying a plain hand-written
-- migration (sqlx::migrate!) since the Desktop Agent has no Prisma/Node
-- runtime of its own.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    remote_id TEXT,              -- backend Project.id once synced, NULL until then
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at TEXT,
    sync_status TEXT NOT NULL DEFAULT 'LOCAL_ONLY' -- LOCAL_ONLY | SYNCED | PENDING | CONFLICT
);

CREATE TABLE IF NOT EXISTS targets (
    id TEXT PRIMARY KEY,
    remote_id TEXT,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type TEXT NOT NULL,          -- DOMAIN | SUBDOMAIN | IP_ADDRESS | CIDR | URL
    value TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at TEXT,
    sync_status TEXT NOT NULL DEFAULT 'LOCAL_ONLY'
);
CREATE INDEX IF NOT EXISTS idx_targets_project ON targets(project_id);

CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,          -- RECON | SCAN
    tool TEXT NOT NULL,          -- SUBFINDER | NUCLEI | ... (ToolRunner::name())
    target_id TEXT NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'QUEUED', -- QUEUED|RUNNING|PAUSED|COMPLETED|FAILED|CANCELLED
    priority INTEGER NOT NULL DEFAULT 0,
    attempt INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    timeout_seconds INTEGER NOT NULL DEFAULT 600,
    error_message TEXT,
    exit_code INTEGER,
    raw_output TEXT,
    heartbeat_at TEXT,
    started_at TEXT,
    finished_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_project ON jobs(project_id);

CREATE TABLE IF NOT EXISTS job_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    level TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_job_logs_job ON job_logs(job_id);

CREATE TABLE IF NOT EXISTS recon_results (
    id TEXT PRIMARY KEY,
    remote_id TEXT,
    job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    target_id TEXT NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
    tool TEXT NOT NULL,
    finding_type TEXT NOT NULL,
    value TEXT NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}', -- JSON blob (tool-specific fields)
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    sync_status TEXT NOT NULL DEFAULT 'LOCAL_ONLY'
);
CREATE INDEX IF NOT EXISTS idx_recon_results_job ON recon_results(job_id);

CREATE TABLE IF NOT EXISTS scan_results (
    id TEXT PRIMARY KEY,
    remote_id TEXT,
    job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    target_id TEXT NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
    tool TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'INFO',
    title TEXT NOT NULL,
    description TEXT,
    endpoint TEXT,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    sync_status TEXT NOT NULL DEFAULT 'LOCAL_ONLY'
);
CREATE INDEX IF NOT EXISTS idx_scan_results_job ON scan_results(job_id);

CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    remote_id TEXT,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at TEXT,
    sync_status TEXT NOT NULL DEFAULT 'LOCAL_ONLY'
);

CREATE TABLE IF NOT EXISTS evidence (
    id TEXT PRIMARY KEY,
    remote_id TEXT,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,     -- absolute local path in the Evidence Library
    mime_type TEXT,
    size_bytes INTEGER,
    sha256 TEXT,
    tags TEXT NOT NULL DEFAULT '[]', -- JSON array
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    sync_status TEXT NOT NULL DEFAULT 'LOCAL_ONLY'
);
CREATE INDEX IF NOT EXISTS idx_evidence_sha256 ON evidence(sha256);

CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    remote_id TEXT,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    format TEXT NOT NULL,        -- PDF|MARKDOWN|HTML|TXT|JSON|ZIP|DOCX
    file_path TEXT,
    content TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    sync_status TEXT NOT NULL DEFAULT 'LOCAL_ONLY'
);

CREATE TABLE IF NOT EXISTS ai_conversations (
    id TEXT PRIMARY KEY,
    remote_id TEXT,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT,
    provider TEXT,
    model TEXT,
    pinned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS ai_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL,          -- SYSTEM|USER|ASSISTANT|TOOL
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'COMPLETE',
    provider TEXT,
    model TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON ai_messages(conversation_id);

CREATE TABLE IF NOT EXISTS activity_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL          -- JSON-encoded
);

-- Sync Engine's outbox — every local write that hasn't reached the
-- backend yet gets a row here (Sync Engine task, see sync/mod.rs).
-- Cleared once the backend acknowledges the push.
CREATE TABLE IF NOT EXISTS offline_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    operation TEXT NOT NULL,     -- CREATE|UPDATE|DELETE
    payload TEXT NOT NULL,       -- JSON snapshot at enqueue time
    attempt INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Local, per-provider AI credentials — same BYOK shape as the backend's
-- AiProviderCredential (apps/api Phase 1), but the Desktop Agent stores
-- only a *reference* here; the actual secret lives in the OS keychain via
-- the `keyring` crate (see ai/credentials.rs) — never plaintext in SQLite.
CREATE TABLE IF NOT EXISTS ai_provider_credentials (
    provider TEXT PRIMARY KEY,
    keyring_ref TEXT NOT NULL,   -- key used to look the secret up in the OS keychain
    key_preview TEXT,
    base_url TEXT,
    model TEXT,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS plugins (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    manifest TEXT NOT NULL,      -- JSON plugin manifest
    installed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
