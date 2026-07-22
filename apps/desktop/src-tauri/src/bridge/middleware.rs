//! Transparent AES-256-GCM envelope encryption for Bridge requests and
//! responses (see `bridge::crypto`'s doc comment for the design
//! rationale). Applied as one `axum::middleware::from_fn_with_state`
//! layer over the whole authenticated router in `bridge::mod`, so
//! individual route handlers (`bridge::routes::*`) never see ciphertext
//! — they read/write plain JSON exactly like any other axum handler, and
//! this layer transparently unwraps/wraps it at the edge.
//!
//! Protocol: a request that wants encryption sets
//! `Content-Type: application/vnd.pentesthub.enc+json` and a JSON body
//! shaped like `bridge::crypto::Envelope`. This layer decrypts it,
//! replaces the body with the plaintext JSON and a normal
//! `application/json` content type, and remembers (via a marker in
//! `http::Extensions`) that the response should be re-encrypted the same
//! way before it goes out. Requests that don't set that content type
//! (i.e. `GET` requests with no body, and `/api/health`) pass through
//! unmodified — encryption only applies where there's a body worth
//! protecting.
//!
//! Note for the real-machine build: this is the single riskiest file in
//! the Bridge Server to get exactly right against a given `axum`/
//! `http-body-util` point release (body-buffering APIs shift between
//! minor versions more than most of axum's surface) — if `cargo build`
//! reports a signature mismatch anywhere in this crate, check here first.

use axum::body::Body;
use axum::extract::{Request, State};
use axum::http::{header, HeaderValue, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

use crate::bridge::crypto::{self, Envelope};
use crate::bridge::state::BridgeState;

const ENCRYPTED_CONTENT_TYPE: &str = "application/vnd.pentesthub.enc+json";
const MAX_BODY_BYTES: usize = 64 * 1024 * 1024; // 64MB — generous for a full-page HTML/screenshot capture

pub async fn encrypt_layer(State(state): State<BridgeState>, req: Request, next: Next) -> Response {
    let is_encrypted_request = req
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|v| v.starts_with(ENCRYPTED_CONTENT_TYPE))
        .unwrap_or(false);

    let req = if is_encrypted_request {
        match decrypt_request(&state, req).await {
            Ok(req) => req,
            Err(resp) => return resp,
        }
    } else {
        req
    };

    let response = next.run(req).await;

    if is_encrypted_request {
        encrypt_response(&state, response).await
    } else {
        response
    }
}

async fn decrypt_request(state: &BridgeState, req: Request) -> Result<Request, Response> {
    let (parts, body) = req.into_parts();
    let bytes = axum::body::to_bytes(body, MAX_BODY_BYTES)
        .await
        .map_err(|_| (StatusCode::PAYLOAD_TOO_LARGE, "Request body too large or unreadable.").into_response())?;

    let envelope: Envelope = serde_json::from_slice(&bytes).map_err(|_| (StatusCode::BAD_REQUEST, "Malformed encrypted envelope.").into_response())?;

    let plaintext = crypto::open(&state.crypto_key, &envelope).map_err(|_| (StatusCode::BAD_REQUEST, "Failed to decrypt request body.").into_response())?;

    let mut parts = parts;
    parts.headers.insert(header::CONTENT_TYPE, HeaderValue::from_static("application/json"));
    Ok(Request::from_parts(parts, Body::from(plaintext)))
}

async fn encrypt_response(state: &BridgeState, response: Response) -> Response {
    let (parts, body) = response.into_parts();
    let bytes = match axum::body::to_bytes(body, MAX_BODY_BYTES).await {
        Ok(b) => b,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to buffer response for encryption.").into_response(),
    };

    let envelope = match crypto::seal(&state.crypto_key, &bytes) {
        Ok(e) => e,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to encrypt response.").into_response(),
    };

    let mut parts = parts;
    parts.headers.insert(header::CONTENT_TYPE, HeaderValue::from_static(ENCRYPTED_CONTENT_TYPE));
    let json = serde_json::to_vec(&envelope).unwrap_or_default();
    parts.headers.insert(header::CONTENT_LENGTH, HeaderValue::from(json.len()));
    Response::from_parts(parts, Body::from(json))
}
