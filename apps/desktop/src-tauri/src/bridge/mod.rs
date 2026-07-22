//! Local Bridge Server — a plain HTTP + WebSocket API bound strictly to
//! `127.0.0.1`, distinct from and running alongside Tauri's own
//! `invoke()` IPC.
//!
//! **Why this exists (Module 8 integration note):** Module 7 gave the
//! Desktop Agent a full command surface, but every one of those
//! `#[tauri::command]`s is only reachable via `invoke()` from *inside the
//! Tauri webview's JS runtime*. The Module 8 Browser Extension's
//! background service worker and the Burp Suite (Jython) extension are
//! both separate OS processes with no access to that webview — they need
//! a real network endpoint. This module is that endpoint: a small axum
//! server, started once from `lib.rs::run()`'s `setup()` alongside
//! everything else `AppState` wires up, reusing the exact same
//! repositories/services Tauri commands use (see `bridge::state::
//! BridgeState`, which holds a cloned `AppState`) so there's no second
//! copy of any business logic — the bridge is a second *transport* for
//! the same backend, not a second backend.
//!
//! **Security posture** (per the Module 8 spec's explicit requirements):
//!   - Binds to `127.0.0.1` only — never `0.0.0.0` — so it is
//!     unreachable from the network, full stop.
//!   - Bearer-token authenticated (`bridge::auth`), token generated once
//!     and paired manually into the extension (no auto-discovery, no
//!     mDNS broadcast of the token).
//!   - Request/response bodies are AES-256-GCM encrypted at the
//!     application layer (`bridge::crypto`, `bridge::middleware`) — see
//!     `bridge::crypto`'s doc comment for why that's used instead of
//!     TLS with a self-signed cert.
//!   - Captures flagged `sensitive: true` are rejected unless the caller
//!     also confirms `confirmed: true` (`bridge::captures::
//!     handle_capture`) — defense in depth for the "never automatically
//!     upload passwords/cookies/tokens without confirmation" rule, whose
//!     primary enforcement is the confirmation dialog in the extension
//!     itself (only the extension knows what's actually on the page).
//!   - The WebSocket (`/api/ws`) is *not* wrapped by the encryption
//!     middleware — it only ever carries state-changed pings and
//!     non-secret notifications (see `bridge::live`), never capture
//!     payloads, so the complexity of framing encrypted WS messages
//!     wasn't worth it for this data. It's still bearer-token gated (via
//!     a `?token=` query param, since browsers can't set WS headers).

pub mod auth;
pub mod captures;
pub mod crypto;
pub mod dto;
pub mod live;
pub mod middleware;
pub mod routes;
pub mod state;
pub mod ws;

use axum::routing::{get, patch, post};
use axum::Router;
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::cors::CorsLayer;

use crate::state::AppState;
use live::LiveSyncHub;
use state::BridgeState;

/// Fixed default port — chosen in the 47000s (IANA dynamic/private
/// range, unassigned) specifically so it's unlikely to collide with
/// anything a pentester's own toolkit is already running (Burp itself
/// defaults to 8080, ZAP to 8080/8090, common dev servers to 3000/5173/
/// 8000). Falls back to an OS-assigned ephemeral port (bind to `:0`) if
/// this one is taken — see `spawn()` — and the actual bound port is what
/// gets surfaced to the user via `bridge_commands::get_bridge_info`, not
/// this constant, so a collision here is a non-event.
pub const DEFAULT_PORT: u16 = 47821;

#[derive(Clone)]
pub struct BridgeHandle {
    pub port: u16,
    pub token: String,
}

/// Starts the Bridge Server and returns immediately (the server itself
/// runs on a spawned Tokio task for the lifetime of the app — there's no
/// explicit shutdown path today, same as the Job Queue's dispatcher and
/// the Sync Engine's background loop; it dies when the process does).
pub async fn spawn(app_state: AppState, data_dir: std::path::PathBuf) -> anyhow::Result<BridgeHandle> {
    let token = load_or_create_token(&app_state).await?;
    let crypto_key = crypto::derive_key(&token);
    let live = LiveSyncHub::new();

    let bridge_state = BridgeState {
        app: app_state,
        token: Arc::from(token.as_str()),
        crypto_key: Arc::new(crypto_key),
        live,
        data_dir,
    };

    let router = build_router(bridge_state);

    // Try the fixed default port first (nicer for documentation/QR-code
    // pairing strings that don't need to embed a dynamic port), fall
    // back to an OS-assigned one if it's taken.
    let listener = match tokio::net::TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], DEFAULT_PORT))).await {
        Ok(l) => l,
        Err(_) => tokio::net::TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], 0))).await?,
    };
    let bound_port = listener.local_addr()?.port();

    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, router).await {
            eprintln!("Bridge Server stopped unexpectedly: {e}");
        }
    });

    Ok(BridgeHandle { port: bound_port, token })
}

fn build_router(state: BridgeState) -> Router {
    // Three tiers, not two:
    //   1. `public` — no auth at all (`/api/health`).
    //   2. `streaming` — bearer-token authenticated but deliberately
    //      *not* wrapped by `encrypt_layer`. `/api/ai/analyze` and
    //      `/api/ws` both stream indefinitely; `encrypt_layer` buffers
    //      the entire response body with `axum::body::to_bytes` before
    //      it can encrypt it (see that module's doc comment), which
    //      would silently turn "stream deltas as they arrive" into
    //      "block until the whole response is done, then deliver it all
    //      at once" — exactly the behavior the Side Panel's streaming
    //      UI depends on NOT happening. Putting these two routes in the
    //      same tier as everything else was a real bug caught while
    //      wiring the Side Panel's conversation-id handling; the fix is
    //      structural (a separate router tier) rather than a special
    //      case inside the middleware, so it can't regress silently if
    //      another streaming route is added later.
    //   3. `authenticated` — bearer-token authenticated AND AES-GCM
    //      envelope encrypted; every request/response body that isn't
    //      inherently a stream.
    let public = Router::new().route("/api/health", get(routes::health));

    let streaming = Router::new()
        .route("/api/ai/analyze", post(routes::ai_analyze))
        .route("/api/ws", get(routes::ws_upgrade))
        .layer(axum::middleware::from_fn_with_state(state.clone(), auth::require_token));

    let authenticated = Router::new()
        .route("/api/pair", post(routes::pair))
        .route("/api/projects", get(routes::list_projects))
        .route("/api/targets", get(routes::list_targets))
        .route("/api/captures", post(routes::create_capture))
        .route("/api/jobs", get(routes::list_jobs).post(routes::start_job))
        .route("/api/jobs/:id", get(routes::get_job))
        .route("/api/findings", get(routes::list_findings).post(routes::create_finding))
        // Accepts POST as well as PATCH for this one route: `java.net
        // .HttpURLConnection` (used by the Burp Suite Extension, see
        // `extensions/burp/pentesthub_burp/bridge_client.py`) has a
        // long-standing restriction on which verbs it can send without a
        // reflection workaround, and PATCH is not reliably one of them
        // across JVM versions. Rather than have the Jython client carry
        // a fragile reflection hack, the one PATCH-shaped endpoint in
        // this API also accepts POST with identical semantics. Every
        // other client (Browser Extension, future Web Dashboard) is
        // free to use real PATCH.
        .route("/api/findings/:id/status", patch(routes::update_finding_status).post(routes::update_finding_status))
        .route("/api/notes", post(routes::create_note))
        .route("/api/payloads", get(routes::list_payloads).post(routes::create_payload))
        .route("/api/live-sync", get(routes::get_live_sync).post(routes::update_live_sync))
        .layer(axum::middleware::from_fn_with_state(state.clone(), middleware::encrypt_layer))
        .layer(axum::middleware::from_fn_with_state(state.clone(), auth::require_token));

    public
        .merge(streaming)
        .merge(authenticated)
        .layer(CorsLayer::permissive())
        .with_state(state)
}

async fn load_or_create_token(app_state: &AppState) -> anyhow::Result<String> {
    const ACCOUNT: &str = "bridge-pairing-token";
    if let Some(existing) = crate::security::keychain::read(ACCOUNT)? {
        return Ok(existing);
    }
    let token = auth::generate_token();
    crate::security::keychain::store(ACCOUNT, &token)?;

    // Mirror a fingerprint (never the raw token) into SQLite so Settings
    // screens can show "paired since <date>" without a keychain round
    // trip — see `migrations/0003_findings.sql`'s `bridge_config` table.
    use sha2::{Digest, Sha256};
    let fingerprint = format!("{:x}", Sha256::digest(token.as_bytes()));
    let _ = sqlx::query("INSERT INTO bridge_config (id, port, token_fingerprint) VALUES (1, ?1, ?2) ON CONFLICT(id) DO UPDATE SET token_fingerprint = excluded.token_fingerprint, rotated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')")
        .bind(DEFAULT_PORT as i64)
        .bind(fingerprint)
        .execute(&app_state.db)
        .await;

    Ok(token)
}

/// Rotates the pairing token (invalidates every currently-paired
/// extension/Burp instance — they'll need the new token re-entered).
/// Exposed to the desktop UI via `commands::bridge_commands::
/// regenerate_bridge_token`.
///
/// Known limitation: this updates the keychain and the `bridge_config`
/// fingerprint immediately, but the *running* Bridge Server's
/// `BridgeState` was already cloned at startup with the old token/key
/// baked in (axum handlers hold an owned `BridgeState`, not a shared
/// mutable one — see that struct's doc comment for why `AppState` itself
/// needed to become cheaply cloneable). The new token therefore only
/// takes effect after the Desktop Agent restarts. `bridge_commands::
/// regenerate_bridge_token`'s response includes `restartRequired: true`
/// so the Settings UI can surface that clearly rather than the user
/// silently wondering why their freshly-copied token gets 401s. Making
/// the token live-rotatable would mean wrapping it in an `Arc<RwLock<_>>`
/// threaded through `auth::require_token` and `middleware::encrypt_layer`
/// — a reasonable follow-up, not done here since token rotation is a
/// rare "I think this leaked" action, not a hot path.
pub async fn rotate_token(app_state: &AppState) -> anyhow::Result<String> {
    const ACCOUNT: &str = "bridge-pairing-token";
    let token = auth::generate_token();
    crate::security::keychain::store(ACCOUNT, &token)?;

    use sha2::{Digest, Sha256};
    let fingerprint = format!("{:x}", Sha256::digest(token.as_bytes()));
    let _ = sqlx::query("UPDATE bridge_config SET token_fingerprint = ?1, rotated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = 1")
        .bind(fingerprint)
        .execute(&app_state.db)
        .await;

    Ok(token)
}
