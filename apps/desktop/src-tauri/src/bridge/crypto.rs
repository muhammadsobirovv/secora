//! AES-256-GCM envelope encryption for the Local Bridge Server's request
//! and response bodies.
//!
//! Why app-layer encryption instead of TLS: the Bridge Server binds
//! *strictly* to `127.0.0.1` (never `0.0.0.0`, enforced in `bridge::mod`),
//! so it is already unreachable from the network — the threat this
//! addresses is a *different local process/user on a shared machine*
//! observing loopback traffic (e.g. via a local proxy, packet capture, or
//! another user's process on a multi-user box), not a remote attacker.
//! TLS would require either a CA-signed cert (impossible for
//! `127.0.0.1`) or a self-signed one, which browser extensions cannot
//! silently trust — `fetch()` from a MV3 background service worker to a
//! self-signed `https://127.0.0.1:PORT` fails with a cert-authority error
//! with no programmatic bypass, forcing the user through an awkward
//! "open this URL once and click through the warning" flow on *every*
//! browser it's installed in. App-layer AES-256-GCM sidesteps that UX
//! trap entirely while still satisfying the Module 8 spec's "Encrypt
//! communication between Browser Extension, Desktop Agent, Web Dashboard"
//! requirement for the data that actually matters (request/response
//! bodies, which is where captured cookies/tokens/headers/HTML travel).
//!
//! The same algorithm (AES-256-GCM, random 12-byte nonce prefixed to the
//! ciphertext+tag, both base64-encoded in a small JSON envelope) is
//! reimplemented on the other two ends of this bridge:
//!   - Browser Extension (`apps/browser-extension/shared/crypto.ts`) via
//!     the WebCrypto `crypto.subtle.encrypt("AES-GCM", ...)` API.
//!   - Burp Suite Extension (`extensions/burp/pentesthub_burp/crypto.py`)
//!     via `javax.crypto.Cipher` — available from Jython since Jython
//!     runs on the JVM and has full access to the Java standard library,
//!     no third-party crypto package needed.
//!
//! The key is derived from the pairing token via HKDF-SHA256 (not the
//! raw token bytes) so a leaked ciphertext-only capture can't be used to
//! recover the bearer token itself even if the KDF were somehow broken.

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::Sha256;

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Envelope {
    /// Envelope format version — bump if the scheme ever changes so old
    /// extension builds fail loudly instead of decrypting garbage.
    pub v: u8,
    /// Base64 (standard, padded) 12-byte GCM nonce.
    pub iv: String,
    /// Base64 (standard, padded) ciphertext with the 16-byte GCM tag
    /// appended (that's `aes_gcm`'s default `encrypt` output layout).
    pub ct: String,
}

/// Derives the 256-bit AES key from the pairing token using HKDF-SHA256
/// with a fixed, public `info` string (domain separation — so the same
/// token could theoretically derive different keys for different
/// purposes without collision).
pub fn derive_key(token: &str) -> [u8; 32] {
    let hk = hkdf::Hkdf::<Sha256>::new(None, token.as_bytes());
    let mut key = [0u8; 32];
    hk.expand(b"pentesthub-bridge-aes-gcm-v1", &mut key)
        .expect("32 bytes is a valid HKDF-SHA256 output length");
    key
}

pub fn seal(key: &[u8; 32], plaintext: &[u8]) -> AppResult<Envelope> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| AppError::new("CRYPTO_ERROR", e.to_string()))?;
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ct = cipher.encrypt(nonce, plaintext).map_err(|e| AppError::new("CRYPTO_ERROR", e.to_string()))?;
    Ok(Envelope {
        v: 1,
        iv: base64_encode(&nonce_bytes),
        ct: base64_encode(&ct),
    })
}

pub fn open(key: &[u8; 32], envelope: &Envelope) -> AppResult<Vec<u8>> {
    if envelope.v != 1 {
        return Err(AppError::new("CRYPTO_VERSION", format!("Unsupported envelope version {}.", envelope.v)));
    }
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| AppError::new("CRYPTO_ERROR", e.to_string()))?;
    let nonce_bytes = base64_decode(&envelope.iv).ok_or_else(|| AppError::new("CRYPTO_ERROR", "Invalid iv encoding."))?;
    if nonce_bytes.len() != 12 {
        return Err(AppError::new("CRYPTO_ERROR", "Invalid nonce length."));
    }
    let ct = base64_decode(&envelope.ct).ok_or_else(|| AppError::new("CRYPTO_ERROR", "Invalid ct encoding."))?;
    let nonce = Nonce::from_slice(&nonce_bytes);
    cipher.decrypt(nonce, ct.as_ref()).map_err(|_| AppError::new("CRYPTO_ERROR", "Decryption failed (wrong key or tampered payload)."))
}

// Minimal dependency-free base64 (standard alphabet, padded) — avoids
// pulling in the `base64` crate for two small functions used only here.
const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

fn base64_encode(data: &[u8]) -> String {
    let mut out = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0];
        let b1 = chunk.get(1).copied();
        let b2 = chunk.get(2).copied();
        out.push(ALPHABET[(b0 >> 2) as usize] as char);
        out.push(ALPHABET[(((b0 & 0x03) << 4) | (b1.unwrap_or(0) >> 4)) as usize] as char);
        if let Some(b1) = b1 {
            out.push(ALPHABET[(((b1 & 0x0f) << 2) | (b2.unwrap_or(0) >> 6)) as usize] as char);
        } else {
            out.push('=');
        }
        if let Some(b2) = b2 {
            out.push(ALPHABET[(b2 & 0x3f) as usize] as char);
        } else {
            out.push('=');
        }
    }
    out
}

fn base64_decode(s: &str) -> Option<Vec<u8>> {
    let s = s.trim_end_matches('=');
    let mut out = Vec::with_capacity(s.len() * 3 / 4);
    let mut buf = 0u32;
    let mut bits = 0u32;
    for c in s.chars() {
        let val = ALPHABET.iter().position(|&b| b as char == c)? as u32;
        buf = (buf << 6) | val;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
        }
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_plaintext() {
        let key = derive_key("test-token-12345");
        let sealed = seal(&key, b"{\"hello\":\"world\"}").unwrap();
        let opened = open(&key, &sealed).unwrap();
        assert_eq!(opened, b"{\"hello\":\"world\"}");
    }

    #[test]
    fn rejects_wrong_key() {
        let key_a = derive_key("token-a");
        let key_b = derive_key("token-b");
        let sealed = seal(&key_a, b"secret").unwrap();
        assert!(open(&key_b, &sealed).is_err());
    }

    #[test]
    fn base64_round_trips() {
        for data in [&b""[..], b"a", b"ab", b"abc", b"abcd", b"\x00\x01\x02\xff"] {
            let encoded = base64_encode(data);
            let decoded = base64_decode(&encoded).unwrap();
            assert_eq!(decoded, data);
        }
    }

    #[test]
    fn different_tokens_derive_different_keys() {
        assert_ne!(derive_key("a"), derive_key("b"));
    }
}
