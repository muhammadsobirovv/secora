//! Live Sync WebSocket — `GET /api/ws?token=<pairing token>`.
//!
//! Query-string auth (rather than the `Authorization` header
//! `bridge::auth::require_token` checks everywhere else) because
//! browsers' `WebSocket` constructor cannot set custom request headers —
//! this is the one bridge endpoint where that limitation applies, so its
//! auth check lives here instead of in the shared middleware. Still
//! constant-time compared, still 401s (well, refuses the upgrade) on
//! mismatch.
//!
//! Once connected, the socket is a pure fan-out: every message the
//! `LiveSyncHub` broadcasts (state-changed pings, notifications) gets
//! forwarded verbatim. The bridge never expects the browser extension to
//! *send* anything meaningful over this socket beyond an occasional
//! ping/pong for keep-alive — real writes go through the REST endpoints
//! (`POST /api/live-sync`, `POST /api/findings`, etc.) so they get proper
//! request/response semantics and the AES-GCM envelope encryption layer,
//! which (deliberately) does not wrap the WebSocket — see the module
//! doc comment in `bridge::mod` for why.

use axum::extract::ws::{Message, WebSocket};

use crate::bridge::state::BridgeState;

pub async fn handle_socket(mut socket: WebSocket, state: BridgeState) {
    let mut rx = state.live.subscribe();

    loop {
        tokio::select! {
            broadcast = rx.recv() => {
                match broadcast {
                    Ok(text) => {
                        if socket.send(Message::Text(text)).await.is_err() {
                            break;
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {
                        // Client fell behind the broadcast buffer (128
                        // messages) — nudge it to re-fetch the
                        // authoritative snapshot rather than trying to
                        // replay everything it missed.
                        let _ = socket.send(Message::Text(serde_json::json!({"kind":"ping","reason":"resync"}).to_string())).await;
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                }
            }
            incoming = socket.recv() => {
                match incoming {
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(_)) => { /* pings/pongs/text from the client are ignored — see doc comment */ }
                    Some(Err(_)) => break,
                }
            }
        }
    }
}
