import { createHash, createPublicKey, verify as cryptoVerify } from 'node:crypto';

/// Digital signature verification for a published plugin version.
/// `sourceBundleBase64` is hashed (SHA-256) and the signature is verified
/// against that hash using the author's Ed25519 public key (Node's
/// built-in `crypto.verify`, no external dependency). Authors register
/// their public key as part of their user profile in a future module —
/// until then, an operator-configured marketplace signing key
/// (`PLUGIN_MARKETPLACE_PUBLIC_KEY`, PEM-encoded SPKI) is the only key
/// this pass verifies against, meaning today's "verified" badge means
/// "published by, or co-signed by, the marketplace operator" rather than
/// "signed by an arbitrary registered author key" — a disclosed, narrower
/// v1 scope than a full author-key registry, tracked as a follow-up.
export function hashPluginBundle(sourceBundleBase64: string): string {
  return createHash('sha256').update(Buffer.from(sourceBundleBase64, 'base64')).digest('hex');
}

export interface VerifyPluginSignatureResult {
  attempted: boolean;
  valid: boolean;
}

export function verifyPluginSignature(
  sourceBundleBase64: string,
  signature: string | undefined,
  publicKeyPem: string | undefined,
): VerifyPluginSignatureResult {
  if (!signature) {
    return { attempted: false, valid: false };
  }
  if (!publicKeyPem) {
    // No marketplace signing key configured in this environment — the
    // signature can't be checked, so it's treated as present-but-
    // unverifiable rather than silently accepted as valid.
    return { attempted: true, valid: false };
  }
  try {
    const publicKey = createPublicKey(publicKeyPem);
    const message = Buffer.from(hashPluginBundle(sourceBundleBase64), 'hex');
    const signatureBuffer = Buffer.from(signature, 'base64');
    // `null` algorithm is correct/required for Ed25519 keys in Node's
    // crypto.verify — the algorithm is implicit in the key type.
    const valid = cryptoVerify(null, message, publicKey, signatureBuffer);
    return { attempted: true, valid };
  } catch {
    return { attempted: true, valid: false };
  }
}
