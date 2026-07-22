//! Bridge pairing token — generated once (32 random bytes, hex-encoded),
//! stored in the OS keychain (`security::keychain`, account
//! `"bridge-pairing-token"`), and required as a bearer token on every
//! Bridge Server request except `GET /api/health` and `POST /api/pair`.
//!
//! Pairing flow: the desktop UI's Settings > Browser Extension panel
//! calls `bridge_commands::get_bridge_info`, which returns the port and
//! token together (Tauri IPC is already a trusted, local, authenticated
//! channel — no separate secret needed to protect that call). The user
//! copies the token (or scans a QR/clicks "Copy pairing string") into the
//! extension's Options page or the Burp extension's config tab. From then
//! on both sides derive the same AES-256-GCM key from the token (see
//! `bridge::crypto::derive_key`) and the extension sends it as
//! `Authorization: Bearer <token>`.

use axum::extract::{Request, State};
use axum::http::StatusCode;
use axum::middleware::Next;
use axum::response::Response;

use crate::bridge::state::BridgeState;

/// Constant-time byte comparison (avoids pulling in the `subtle` crate for
/// one function — same technique used by most hand-rolled token
/// comparisons: fold every byte into the accumulator regardless of
/// whether an earlier byte already mismatched, so timing doesn't leak
/// *where* the first difference is).
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

pub async fn require_token(State(state): State<BridgeState>, req: Request, next: Next) -> Result<Response, StatusCode> {
    let path = req.uri().path();
    if path == "/api/health" {
        return Ok(next.run(req).await);
    }

    let header_token = req
        .headers()
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(str::to_string);

    // `/api/ws` is the one exception to header-based auth: browsers'
    // `WebSocket` constructor can't set custom headers, so the Live Sync
    // socket is opened as `wss://127.0.0.1:PORT/api/ws?token=<token>`
    // instead (see `bridge::ws`'s doc comment).
    let query_token = if path == "/api/ws" { req.uri().query().and_then(find_token_param) } else { None };

    let provided = header_token.or(query_token);

    match provided {
        Some(token) if constant_time_eq(token.as_bytes(), state.token.as_bytes()) => Ok(next.run(req).await),
        _ => Err(StatusCode::UNAUTHORIZED),
    }
}

/// Minimal `?token=...` extractor — avoids pulling in the `url` crate's
/// `form_urlencoded` parser for one query param on one route. Doesn't
/// percent-decode beyond `%XX` hex pairs and `+` -> space (the pairing
/// token itself is plain hex, so this only needs to be correct, not
/// fully RFC 3986-general).
fn find_token_param(query: &str) -> Option<String> {
    for pair in query.split('&') {
        let mut parts = pair.splitn(2, '=');
        let key = parts.next()?;
        let value = parts.next().unwrap_or("");
        if key == "token" {
            return Some(percent_decode(value));
        }
    }
    None
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b'%' if i + 2 < bytes.len() => {
                if let Ok(byte) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                    out.push(byte);
                    i += 3;
                } else {
                    out.push(bytes[i]);
                    i += 1;
                }
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Generates a new 256-bit pairing token, hex-encoded (64 chars) — plenty
/// of entropy for a loopback-only bearer credential that's also rotatable
/// on demand from Settings.
pub fn generate_token() -> String {
    use rand::RngCore;
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
