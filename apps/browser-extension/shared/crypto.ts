// AES-256-GCM envelope encryption — mirrors the Rust side exactly
// (`apps/desktop/src-tauri/src/bridge/crypto.rs`). Key is derived from
// the pairing token via HKDF-SHA256 with the same fixed `info` string,
// so both ends independently arrive at the same 256-bit key without ever
// transmitting it. Uses the browser's native WebCrypto (`crypto.subtle`)
// — no third-party crypto dependency, works identically in every MV3
// browser this extension targets (Chrome/Edge/Brave/Opera/Firefox all
// implement WebCrypto).

const HKDF_INFO = new TextEncoder().encode("pentesthub-bridge-aes-gcm-v1");

export interface Envelope {
  v: 1;
  iv: string; // base64
  ct: string; // base64
}

async function importHkdfKey(token: string): Promise<CryptoKey> {
  const tokenBytes = new TextEncoder().encode(token);
  return crypto.subtle.importKey("raw", tokenBytes, "HKDF", false, ["deriveKey"]);
}

/**
 * Derives the AES-256-GCM key from the pairing token. Uses an empty
 * salt to match the Rust side's `Hkdf::<Sha256>::new(None, token)` (a
 * `None` salt in the `hkdf` crate is treated as an all-zero salt of the
 * hash's output length, which is exactly what WebCrypto's HKDF does when
 * `salt` is an empty `ArrayBuffer` too — both resolve to the same
 * HMAC-SHA256 extract step).
 */
export async function deriveKey(token: string): Promise<CryptoKey> {
  const hkdfKey = await importHkdfKey(token);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: HKDF_INFO },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    // `extractable: true` — deliberately not `false`. This key is
    // derived fresh from the pairing token every time (see
    // `importHkdfKey`/`deriveKey` above); anyone who can call this
    // function already has the token and could derive the same key
    // bytes themselves, so marking it non-extractable would add no real
    // confidentiality, only make the key untestable (`tests/crypto
    // .test.ts` verifies this function against the same known vector
    // the Rust and Jython implementations are checked against, which
    // requires exporting the raw bytes to compare).
    true,
    ["encrypt", "decrypt"],
  );
}

export async function seal(key: CryptoKey, plaintext: string): Promise<Envelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(plaintext);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  return { v: 1, iv: bufferToBase64(iv), ct: bufferToBase64(new Uint8Array(ct)) };
}

export async function open(key: CryptoKey, envelope: Envelope): Promise<string> {
  if (envelope.v !== 1) throw new Error(`Unsupported envelope version ${envelope.v}`);
  const iv = base64ToBuffer(envelope.iv);
  const ct = base64ToBuffer(envelope.ct);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(plaintext);
}

function bufferToBase64(buf: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
  return btoa(binary);
}

function base64ToBuffer(b64: string): Uint8Array {
  const binary = atob(b64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf;
}

/** SHA-256 hex digest — used for screenshot hash verification. */
export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
