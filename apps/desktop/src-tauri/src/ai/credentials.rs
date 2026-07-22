//! OS-keychain-backed credential storage for BYOK AI provider keys (see
//! `storage/0001_init.sql`'s `ai_provider_credentials` table, which stores
//! only a `keyring_ref` — never the secret itself). Filled in alongside
//! the provider adapters (task #139); stubbed now so `state.rs` and the
//! settings commands have a stable import path to build against.

use crate::error::{AppError, AppResult};

const SERVICE_NAME: &str = "ai.pentesthub.desktop";

pub fn store_secret(provider: &str, secret: &str) -> AppResult<()> {
    let entry = keyring::Entry::new(SERVICE_NAME, provider)
        .map_err(|e| AppError::new("KEYRING_ERROR", e.to_string()))?;
    entry
        .set_password(secret)
        .map_err(|e| AppError::new("KEYRING_ERROR", e.to_string()))
}

pub fn read_secret(provider: &str) -> AppResult<Option<String>> {
    let entry = keyring::Entry::new(SERVICE_NAME, provider)
        .map_err(|e| AppError::new("KEYRING_ERROR", e.to_string()))?;
    match entry.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AppError::new("KEYRING_ERROR", e.to_string())),
    }
}

pub fn delete_secret(provider: &str) -> AppResult<()> {
    let entry = keyring::Entry::new(SERVICE_NAME, provider)
        .map_err(|e| AppError::new("KEYRING_ERROR", e.to_string()))?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AppError::new("KEYRING_ERROR", e.to_string())),
    }
}
