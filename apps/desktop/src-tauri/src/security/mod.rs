//! Security — the six items in the Module 7 spec map to concrete,
//! already-in-place mechanisms plus one new piece (local encryption for
//! backups/exports) added here:
//!
//! 1. **Secure credential storage** — `ai::credentials` and `sync`'s
//!    keychain helpers store every secret (AI provider API keys, sync
//!    bearer tokens) in the OS keychain (Credential Manager / Keychain /
//!    Secret Service) via the `keyring` crate. SQLite only ever holds a
//!    reference (`keyring_ref`), never the secret itself.
//! 2. **Local encryption** — this module. AES-256-GCM (`aes-gcm` crate)
//!    with a random-nonce-per-message scheme, keyed by a secret held in
//!    the OS keychain (same posture as credential storage: the *data* can
//!    live in a plain file, but the *key* never does). Used for
//!    `commands::security_commands::create_encrypted_backup` — encrypting
//!    a full SQLite DB export before it's written anywhere that isn't the
//!    OS-protected app data directory (e.g. a USB drive, a synced Dropbox
//!    folder).
//! 3. **Secret management** — one place (`security::keychain`) that reads/
//!    writes every OS-keychain-backed secret across the app (AI
//!    credentials, sync token, backup encryption key), so there's a
//!    single audit point rather than three modules each rolling their own
//!    `keyring::Entry::new(...)` calls with slightly different
//!    conventions.
//! 4. **Secure IPC** — enforced by `tauri.conf.json`'s CSP
//!    (`default-src 'self'`, no remote script execution) and Tauri 2's
//!    capability system (`capabilities/default.json` — the webview can
//!    only call the specific plugin commands granted there, not an
//!    arbitrary OS API surface). Every `#[tauri::command]` is a typed,
//!    explicit Rust function; there's no `eval`-style bridge.
//! 5. **Signed update verification** — `tauri-plugin-updater`, configured
//!    in `tauri.conf.json`'s `plugins.updater` block with an ed25519
//!    public key. The updater refuses to apply any update package whose
//!    signature doesn't verify against that key, so a compromised/
//!    tampered release endpoint can't push arbitrary code — this is
//!    enforced by Tauri itself, not app code, and requires running
//!    `tauri signer generate` on a real machine to produce a real keypair
//!    (the checked-in pubkey is a placeholder, see that file's comment).
//! 6. **Sandboxed process execution** — every tool/plugin subprocess goes
//!    through `services::tool_process::spawn_tool` (recon/scanner tools)
//!    or the equivalent argv-only spawn in `plugins::runner`
//!    (custom-script/tool-integration plugins): arguments are always
//!    passed as an argv array, *never* interpolated into a shell string,
//!    which is what actually prevents command injection from
//!    attacker-influenced target/finding values. There's no additional OS
//!    sandbox (seccomp/AppContainer) layer in this pass — flagged as a
//!    real, load-bearing limitation rather than glossed over: a
//!    compromised recon tool binary itself is not contained beyond normal
//!    OS process boundaries.

pub mod backup;
pub mod keychain;
