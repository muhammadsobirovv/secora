import { describe, expect, it } from '@jest/globals';
import { generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import { hashPluginBundle, verifyPluginSignature } from './plugin-signature.util.js';

function signBundle(sourceBundleBase64: string, privateKeyPem: string): string {
  const message = Buffer.from(hashPluginBundle(sourceBundleBase64), 'hex');
  return cryptoSign(null, message, privateKeyPem).toString('base64');
}

describe('verifyPluginSignature', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

  it('reports attempted: false when no signature is supplied', () => {
    const result = verifyPluginSignature(Buffer.from('code').toString('base64'), undefined, publicKeyPem);
    expect(result).toEqual({ attempted: false, valid: false });
  });

  it('reports attempted: true, valid: false when no marketplace public key is configured', () => {
    const bundle = Buffer.from('console.log(1)').toString('base64');
    const signature = signBundle(bundle, privateKeyPem);
    const result = verifyPluginSignature(bundle, signature, undefined);
    expect(result).toEqual({ attempted: true, valid: false });
  });

  it('verifies a correctly signed bundle as valid', () => {
    const bundle = Buffer.from('module.exports.hello = () => "hi";').toString('base64');
    const signature = signBundle(bundle, privateKeyPem);
    const result = verifyPluginSignature(bundle, signature, publicKeyPem);
    expect(result).toEqual({ attempted: true, valid: true });
  });

  it('rejects a signature that does not match the bundle (tampered source)', () => {
    const bundle = Buffer.from('module.exports.hello = () => "hi";').toString('base64');
    const signature = signBundle(bundle, privateKeyPem);
    const tamperedBundle = Buffer.from('module.exports.hello = () => "evil";').toString('base64');
    const result = verifyPluginSignature(tamperedBundle, signature, publicKeyPem);
    expect(result).toEqual({ attempted: true, valid: false });
  });

  it('rejects a malformed signature without throwing', () => {
    const bundle = Buffer.from('code').toString('base64');
    expect(() => verifyPluginSignature(bundle, 'not-valid-base64-signature!!!', publicKeyPem)).not.toThrow();
    const result = verifyPluginSignature(bundle, 'not-valid-base64-signature!!!', publicKeyPem);
    expect(result.valid).toBe(false);
  });
});
