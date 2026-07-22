import { createHash, createHmac } from 'node:crypto';

/// Hand-rolled AWS Signature Version 4 signer (no `aws-sdk`/`@aws-sdk/*`
/// dependency — see the Module 10 integrations ADR for why: this
/// sandbox cannot verify a fresh heavy SDK dependency compiles/installs
/// cleanly, and SigV4 for a handful of S3 REST calls is ~120 lines of
/// well-specified crypto, not worth a multi-hundred-MB dependency).
/// Implements the "Authorization header" signing variant documented at
/// https://docs.aws.amazon.com/general/latest/gr/sigv4-signed-request-examples.html
/// Covers exactly what the AwsAdapter needs: signing a single HTTP
/// request (GET/PUT to S3) with an access key + secret key (+ optional
/// session token for temporary/STS credentials).

export interface AwsSigV4Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export interface AwsSigV4SignInput {
  method: string;
  url: URL;
  region: string;
  service: string;
  headers: Record<string, string>;
  /// Raw request body; SHA-256 hashed for the canonical request and,
  /// for S3, sent as-is. Use an empty Buffer for bodyless requests
  /// (GET/DELETE) — S3 requires the hash of an empty string in that case,
  /// which `sha256Hex(Buffer.alloc(0))` produces correctly.
  body: Buffer;
  credentials: AwsSigV4Credentials;
}

function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

function amzDate(now: Date): { amzDate: string; dateStamp: string } {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

/// Signs an HTTP request and returns the full header set to attach
/// (including the computed `Authorization`, `x-amz-date`,
/// `x-amz-content-sha256`, and `x-amz-security-token` when a session
/// token is present). Callers spread the return value into their
/// `fetch()` headers object.
export function signAwsRequest(input: AwsSigV4SignInput): Record<string, string> {
  const { method, url, region, service, credentials } = input;
  const now = new Date();
  const { amzDate: xAmzDate, dateStamp } = amzDate(now);
  const payloadHash = sha256Hex(input.body);

  const canonicalHeaders: Record<string, string> = {
    ...input.headers,
    host: url.host,
    'x-amz-date': xAmzDate,
    'x-amz-content-sha256': payloadHash,
  };
  if (credentials.sessionToken) canonicalHeaders['x-amz-security-token'] = credentials.sessionToken;

  const sortedHeaderNames = Object.keys(canonicalHeaders)
    .map((h) => h.toLowerCase())
    .sort();
  const canonicalHeadersBlock = sortedHeaderNames.map((h) => `${h}:${canonicalHeaders[h] ?? canonicalHeaders[h.toUpperCase()]}\n`).join('');
  const signedHeaders = sortedHeaderNames.join(';');

  const canonicalQuery = [...url.searchParams.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const canonicalRequest = [
    method.toUpperCase(),
    url.pathname || '/',
    canonicalQuery,
    canonicalHeadersBlock,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', xAmzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n');

  const kDate = hmac(`AWS4${credentials.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = hmac(kSigning, stringToSign).toString('hex');

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    'x-amz-date': xAmzDate,
    'x-amz-content-sha256': payloadHash,
    ...(credentials.sessionToken ? { 'x-amz-security-token': credentials.sessionToken } : {}),
    Authorization: authorization,
  };
}
