-- Local Payload Library — one of the seven content types Local RAG
-- indexes (migrations/0001_init.sql predates this requirement being
-- pinned down; kept as its own migration rather than folded into 0001 so
-- existing installs upgrade additively).
CREATE TABLE IF NOT EXISTS payloads (
    id TEXT PRIMARY KEY,
    remote_id TEXT,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    example TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    sync_status TEXT NOT NULL DEFAULT 'LOCAL_ONLY'
);
