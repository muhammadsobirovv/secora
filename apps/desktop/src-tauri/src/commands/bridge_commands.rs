//! Tauri commands backing Settings > Browser Extension — surfaces the
//! Bridge Server's pairing info to the desktop UI. These are the *only*
//! place the pairing token is ever displayed in plaintext; everywhere
//! else (the extension's Options page, the Burp extension's config tab)
//! it's pasted in by the user, never fetched over the network.

use tauri::State;

use crate::error::AppResult;
use crate::state::AppState;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeInfo {
    pub port: u16,
    pub token: String,
    /// `http://127.0.0.1:{port}` — what the extension's Options page /
    /// Burp extension's config tab should be pointed at. No scheme
    /// upgrade to `https` since the Bridge Server doesn't terminate TLS
    /// (see `bridge::mod`'s doc comment on the AES-GCM-over-plain-HTTP
    /// design choice).
    pub base_url: String,
    /// Convenience single string the desktop UI can render as a QR code
    /// or "copy pairing string" button — `pentesthub://pair?port=..&token=..`.
    pub pairing_uri: String,
}

#[tauri::command]
pub fn get_bridge_info(state: State<'_, AppState>) -> AppResult<BridgeInfo> {
    let handle = state
        .bridge
        .get()
        .ok_or_else(|| crate::error::AppError::new("BRIDGE_NOT_RUNNING", "The Bridge Server failed to start — check the app logs. Browser Extension / Burp integration is unavailable until the app is restarted."))?;

    Ok(BridgeInfo {
        port: handle.port,
        token: handle.token.clone(),
        base_url: format!("http://127.0.0.1:{}", handle.port),
        pairing_uri: format!("pentesthub://pair?port={}&token={}", handle.port, handle.token),
    })
}

#[tauri::command]
pub async fn regenerate_bridge_token(state: State<'_, AppState>) -> AppResult<serde_json::Value> {
    let token = crate::bridge::rotate_token(state.inner()).await.map_err(crate::error::AppError::from)?;
    Ok(serde_json::json!({ "token": token, "restartRequired": true }))
}
