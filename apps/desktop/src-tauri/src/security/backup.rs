//! Local encryption for full-database backups/exports (Settings > Storage
//! > "Export encrypted backup"). AES-256-GCM, one random 96-bit nonce per
//! backup, prepended to the ciphertext (`nonce || ciphertext || tag`) —
//! the standard AEAD-with-prefixed-nonce layout, needing no separate
//! metadata file to restore.

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use rand::RngCore;
use std::path::Path;

use super::keychain;
use crate::error::{AppError, AppResult};

const NONCE_LEN: usize = 12;

pub async fn encrypt_file(source: &Path, dest: &Path) -> AppResult<()> {
    let key_bytes = keychain::get_or_create_backup_key()?;
    let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);

    let mut nonce_bytes = [0u8; NONCE_LEN];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let plaintext = tokio::fs::read(source).await.map_err(AppError::from)?;
    let ciphertext = cipher.encrypt(nonce, plaintext.as_ref()).map_err(|e| AppError::new("ENCRYPTION_FAILED", e.to_string()))?;

    let mut out = Vec::with_capacity(NONCE_LEN + ciphertext.len());
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ciphertext);

    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent).await.map_err(AppError::from)?;
    }
    tokio::fs::write(dest, out).await.map_err(AppError::from)?;
    Ok(())
}

pub async fn decrypt_file(source: &Path, dest: &Path) -> AppResult<()> {
    let key_bytes = keychain::get_or_create_backup_key()?;
    let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);

    let data = tokio::fs::read(source).await.map_err(AppError::from)?;
    if data.len() < NONCE_LEN {
        return Err(AppError::new("INVALID_BACKUP", "Backup file is too short to contain a nonce."));
    }
    let (nonce_bytes, ciphertext) = data.split_at(NONCE_LEN);
    let nonce = Nonce::from_slice(nonce_bytes);

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| AppError::new("DECRYPTION_FAILED", "Could not decrypt backup — wrong machine/key, or the file is corrupted."))?;

    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent).await.map_err(AppError::from)?;
    }
    tokio::fs::write(dest, plaintext).await.map_err(AppError::from)?;
    Ok(())
}

/// Snapshots the live SQLite DB to a temp file via `VACUUM INTO` (safe
/// under concurrent readers/writers, unlike a raw file copy of a
/// WAL-mode database) and encrypts that snapshot.
pub async fn backup_database(db: &sqlx::SqlitePool, db_snapshot_dir: &Path, dest: &Path) -> AppResult<()> {
    let snapshot_path = db_snapshot_dir.join(format!("snapshot-{}.db", uuid::Uuid::new_v4()));
    tokio::fs::create_dir_all(db_snapshot_dir).await.map_err(AppError::from)?;

    sqlx::query(&format!("VACUUM INTO '{}'", snapshot_path.to_string_lossy().replace('\'', "''")))
        .execute(db)
        .await?;

    let result = encrypt_file(&snapshot_path, dest).await;
    let _ = tokio::fs::remove_file(&snapshot_path).await; // best-effort cleanup of the unencrypted snapshot
    result
}
