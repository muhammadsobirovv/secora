import { describe, expect, it } from '@jest/globals';
import { signAwsRequest } from './aws-sigv4.util.js';

const CREDENTIALS = { accessKeyId: 'AKIAEXAMPLE', secretAccessKey: 'exampleSecretKey1234567890' };

describe('signAwsRequest', () => {
  it('produces an Authorization header with the AWS4-HMAC-SHA256 scheme and the access key id', () => {
    const headers = signAwsRequest({
      method: 'GET',
      url: new URL('https://my-bucket.s3.us-east-1.amazonaws.com/?list-type=2'),
      region: 'us-east-1',
      service: 's3',
      headers: {},
      body: Buffer.alloc(0),
      credentials: CREDENTIALS,
    });
    expect(headers.Authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE\/\d{8}\/us-east-1\/s3\/aws4_request, SignedHeaders=.+, Signature=[a-f0-9]{64}$/);
    expect(headers['x-amz-date']).toMatch(/^\d{8}T\d{6}Z$/);
    expect(headers['x-amz-content-sha256']).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces the well-known SHA-256 hash of an empty body', () => {
    const headers = signAwsRequest({
      method: 'GET',
      url: new URL('https://bucket.s3.us-east-1.amazonaws.com/'),
      region: 'us-east-1',
      service: 's3',
      headers: {},
      body: Buffer.alloc(0),
      credentials: CREDENTIALS,
    });
    // SHA-256("") — a fixed, well-known constant, confirms the hashing path is correct.
    expect(headers['x-amz-content-sha256']).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('produces a different signature for a different body (PutObject)', () => {
    const base = {
      method: 'PUT',
      url: new URL('https://bucket.s3.us-east-1.amazonaws.com/report.pdf'),
      region: 'us-east-1',
      service: 's3',
      headers: { 'content-type': 'application/pdf' },
      credentials: CREDENTIALS,
    };
    const headersA = signAwsRequest({ ...base, body: Buffer.from('report contents A') });
    const headersB = signAwsRequest({ ...base, body: Buffer.from('report contents B') });
    expect(headersA['x-amz-content-sha256']).not.toBe(headersB['x-amz-content-sha256']);
    expect(headersA.Authorization).not.toBe(headersB.Authorization);
  });

  it('includes x-amz-security-token when a session token is supplied', () => {
    const headers = signAwsRequest({
      method: 'GET',
      url: new URL('https://bucket.s3.us-east-1.amazonaws.com/'),
      region: 'us-east-1',
      service: 's3',
      headers: {},
      body: Buffer.alloc(0),
      credentials: { ...CREDENTIALS, sessionToken: 'temp-session-token' },
    });
    expect(headers['x-amz-security-token']).toBe('temp-session-token');
  });

  it('omits x-amz-security-token when no session token is supplied', () => {
    const headers = signAwsRequest({
      method: 'GET',
      url: new URL('https://bucket.s3.us-east-1.amazonaws.com/'),
      region: 'us-east-1',
      service: 's3',
      headers: {},
      body: Buffer.alloc(0),
      credentials: CREDENTIALS,
    });
    expect(headers['x-amz-security-token']).toBeUndefined();
  });
});
