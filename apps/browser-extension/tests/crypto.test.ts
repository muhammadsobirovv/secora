import { describe, it, expect } from "vitest";
import { deriveKey, seal, open } from "../shared/crypto";

// Node 19+ exposes WebCrypto as the global `crypto`, same API surface
// this module targets in the browser — no mocking needed to run these
// under vitest/Node.

describe("bridge crypto envelope", () => {
  it("round-trips plaintext through seal/open", async () => {
    const key = await deriveKey("test-token-12345");
    const envelope = await seal(key, JSON.stringify({ hello: "world" }));
    const plaintext = await open(key, envelope);
    expect(JSON.parse(plaintext)).toEqual({ hello: "world" });
  });

  it("produces a fresh nonce on every seal call", async () => {
    const key = await deriveKey("test-token-12345");
    const a = await seal(key, "same plaintext");
    const b = await seal(key, "same plaintext");
    expect(a.iv).not.toEqual(b.iv);
    expect(a.ct).not.toEqual(b.ct);
  });

  it("fails to decrypt with the wrong key", async () => {
    const keyA = await deriveKey("token-a");
    const keyB = await deriveKey("token-b");
    const envelope = await seal(keyA, "secret");
    await expect(open(keyB, envelope)).rejects.toThrow();
  });

  it("rejects a tampered ciphertext (GCM auth tag)", async () => {
    const key = await deriveKey("test-token-12345");
    const envelope = await seal(key, "secret");
    const tampered = { ...envelope, ct: envelope.ct.slice(0, -4) + "AAAA" };
    await expect(open(key, tampered)).rejects.toThrow();
  });

  it("derives the same known-vector key the Rust and Jython sides derive", async () => {
    // Cross-checked against Python's `cryptography` HKDF implementation
    // and the Rust `hkdf` crate during Module 8 development — see
    // `docs/modules/08-browser-extension.md`'s "Verification handoff"
    // section for the exact commands. All three implementations
    // (TypeScript here, Rust in `bridge::crypto`, Jython in
    // `pentesthub_burp/crypto.py`) must agree on this vector for
    // pairing to actually work end to end.
    const key = await deriveKey("test-token-12345");
    const raw = await crypto.subtle.exportKey("raw", key);
    const hex = Array.from(new Uint8Array(raw))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    expect(hex).toBe("28752a02bb3aef54ca14048ae7ba850e78664b9ba92cf525610d0a5cd3afd9b0");
  });
});
