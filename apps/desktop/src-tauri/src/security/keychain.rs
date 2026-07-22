//! Single audit point for every OS-keychain-backed secret in the app.
//! `ai::credentials` and `sync`'s token helpers predate this module and
//! keep their own thin wrappers (documented there as intentional — they
//! were written first, during tasks #139/#138) — new secret categories
//! should be added here going forward.

use crate::error::{AppError, AppResult};

const SERVICE_NAME: &str = "security.pentesthub.desktop";

pub fn store(account: &str, secret: &str) -> AppResult<()> {
    let entry = keyring::Entry::new(SERVICE_NAME, account).map_err(keyring_err)?;
    entry.set_password(secret).map_err(keyring_err)
}

pub fn read(account: &str) -> AppResult<Option<String>> {
    let entry = keyring::Entry::new(SERVICE_NAME, account).map_err(keyring_err)?;
    match entry.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(keyring_err(e)),
    }
}

pub fn delete(account: &str) -> AppResult<()> {
    let entry = keyring::Entry::new(SERVICE_NAME, account).map_err(keyring_err)?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(keyring_err(e)),
    }
}

/// Returns the backup encryption key, generating and persisting a new
/// random 256-bit key on first use. Never leaves the OS keychain except
/// as raw bytes held briefly in process memory during encrypt/decrypt.
pub fn get_or_create_backup_key() -> AppResult<[u8; 32]> {
    const ACCOUNT: &str = "backup-encryption-key";
    if let Some(existing) = read(ACCOUNT)? {
        let bytes = hex_decode(&existing).ok_or_else(|| AppError::new("KEYCHAIN_CORRUPT", "Stored backup key is not valid hex."))?;
        if bytes.len() == 32 {
            let mut key = [0u8; 32];
            key.copy_from_slice(&bytes);
            return Ok(key);
        }
    }

    use rand::RngCore;
    let mut key = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut key);
    store(ACCOUNT, &hex_encode(&key))?;
    Ok(key)
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn hex_decode(s: &str) -> Option<Vec<u8>> {
    if s.len() % 2 != 0 {
        return None;
    }
    (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).ok()).collect()
}

fn keyring_err(e: keyring::Error) -> AppError {
    AppError::new("KEYRING_ERROR", e.to_string())
}
