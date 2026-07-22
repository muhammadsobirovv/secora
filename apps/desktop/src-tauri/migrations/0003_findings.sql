-- Findings — added for Module 8 (Browser Extension + Burp Suite
-- Integration): the Burp Suite Extension's "Create Finding" action and the
-- Browser Extension's "AI Analysis" / recon-shortcut results both need a
-- first-class local record distinct from a free-form Note (structured
-- severity/status/source so the desktop UI and the eventual web-dashboard
-- sync can filter/triage them, matching the web app's Finding model in
-- spirit). Kept as its own migration, additive, so existing installs
-- upgrade without touching 0001/0002.
CREATE TABLE IF NOT EXISTS findings (
    id TEXT PRIMARY KEY,
    remote_id TEXT,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    target_id TEXT REFERENCES targets(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'INFO',     -- CRITICAL | HIGH | MEDIUM | LOW | INFO
    status TEXT NOT NULL DEFAULT 'OPEN',       -- OPEN | CONFIRMED | FIXED | FALSE_POSITIVE
    source TEXT NOT NULL DEFAULT 'MANUAL',     -- MANUAL | BURP | BROWSER_EXTENSION | AI
    url TEXT,
    description TEXT,
    evidence TEXT,                             -- request/response, PoC, or AI analysis text
    tags TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    deleted_at TEXT,
    sync_status TEXT NOT NULL DEFAULT 'LOCAL_ONLY'
);

CREATE INDEX IF NOT EXISTS idx_findings_project ON findings(project_id);

-- Bridge pairing — one row, holds the local HTTP/WS API's bearer token
-- (also mirrored into the OS keychain, see security/keychain.rs; the DB
-- copy exists so `SELECT` based Settings screens can show "last rotated"
-- metadata without a keychain round trip) and the port it's bound to.
CREATE TABLE IF NOT EXISTS bridge_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    port INTEGER NOT NULL,
    token_fingerprint TEXT NOT NULL, -- sha256(token) — never the raw token
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    rotated_at TEXT
);
