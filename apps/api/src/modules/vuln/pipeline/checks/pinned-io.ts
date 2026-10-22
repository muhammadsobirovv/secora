import http from 'node:http';
import https from 'node:https';
import tls, { type PeerCertificate } from 'node:tls';
import type { PinnedHost } from '../pin.util.js';

/// Network access for the native checks. Both helpers connect to the address
/// pinned for the host (never to a fresh DNS answer) while using the real
/// hostname for the Host header, TLS SNI and certificate matching. Neither
/// follows redirects. They are injected into the checks service so unit tests
/// run without a network.

export const CHECK_USER_AGENT = 'SecoraScan/1.0 (security self-assessment)';

export interface PinnedResponse {
  status: number;
  /// Lower-cased header names; repeated headers other than set-cookie are joined.
  headers: Record<string, string>;
  setCookies: string[];
}

export interface PinnedGetRequest {
  pin: PinnedHost;
  scheme: 'http' | 'https';
  port: number;
  path: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export type PinnedGet = (request: PinnedGetRequest) => Promise<PinnedResponse>;

/// GET with the connection forced to `pin.ip`. Certificate errors are ignored
/// here on purpose: the header and cookie checks must still read a site whose
/// certificate is broken; the certificate is judged by the TLS probe.
export const pinnedGet: PinnedGet = (request) =>
  new Promise((resolve, reject) => {
    const lib = request.scheme === 'https' ? https : http;
    const req = lib.request(
      {
        host: request.pin.host,
        port: request.port,
        path: request.path,
        method: 'GET',
        headers: {
          'user-agent': CHECK_USER_AGENT,
          accept: '*/*',
          ...request.headers,
        },
        lookup: (_hostname, _options, callback) =>
          callback(
            null,
            [{ address: request.pin.ip, family: request.pin.family }] as never,
            request.pin.family,
          ),
        servername: request.pin.host,
        rejectUnauthorized: false,
        agent: false,
        timeout: request.timeoutMs ?? 10_000,
        signal: request.signal,
      },
      (response) => {
        const headers: Record<string, string> = {};
        for (const [name, value] of Object.entries(response.headers)) {
          if (name === 'set-cookie') continue;
          headers[name] = Array.isArray(value)
            ? value.join(', ')
            : (value ?? '');
        }
        const setCookies = response.headers['set-cookie'] ?? [];
        // Headers are all the checks need; drop the body.
        response.destroy();
        resolve({ status: response.statusCode ?? 0, headers, setCookies });
      },
    );
    req.once('timeout', () => req.destroy(new Error('Request timed out.')));
    req.once('error', reject);
    req.end();
  });

export interface TlsInfo {
  /// Negotiated protocol, e.g. "TLSv1.3".
  protocol: string | null;
  cipher: string | null;
  /// Whether the chain validates against the system trust store for the real hostname.
  authorized: boolean;
  authorizationError: string | null;
  subject: string | null;
  issuer: string | null;
  validFrom: string | null;
  validTo: string | null;
  /// RSA key size in bits (null for EC keys).
  keyBits: number | null;
  selfSigned: boolean;
  /// Whether the certificate names the real hostname.
  hostnameMatches: boolean;
  /// Whether TLS 1.0 / 1.1 handshakes succeed; null when this machine could not test.
  acceptsTls10: boolean | null;
  acceptsTls11: boolean | null;
}

export type TlsProbe = (input: {
  pin: PinnedHost;
  port: number;
  signal?: AbortSignal;
}) => Promise<TlsInfo>;

function connectOnce(
  pin: PinnedHost,
  port: number,
  options: tls.ConnectionOptions,
  timeoutMs: number,
): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: pin.ip,
      port,
      servername: pin.host,
      rejectUnauthorized: false,
      ...options,
    });
    socket.setTimeout(timeoutMs, () =>
      socket.destroy(new Error('TLS handshake timed out.')),
    );
    socket.once('secureConnect', () => resolve(socket));
    socket.once('error', reject);
  });
}

function distinguishedName(cert: PeerCertificate): string | null {
  const subject = cert.subject as unknown as Record<string, string> | undefined;
  return subject?.CN ?? subject?.O ?? null;
}

/// Reads the certificate and negotiated parameters, then tries TLS 1.0 and 1.1
/// handshakes to see whether the server still accepts them. A handshake the
/// local OpenSSL refuses to even start is reported as "not tested" (null), never
/// as "not accepted".
export const tlsProbe: TlsProbe = async ({ pin, port }) => {
  const socket = await connectOnce(pin, port, {}, 10_000);
  try {
    const cert = socket.getPeerCertificate(true);
    const empty = !cert || Object.keys(cert).length === 0;
    const issuerCert = !empty
      ? (cert.issuerCertificate as PeerCertificate | undefined)
      : undefined;
    // The typings call this an Error; at runtime it is the OpenSSL code string.
    const authError = String(socket.authorizationError ?? '');
    const selfSigned =
      !empty &&
      (authError === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
        authError === 'SELF_SIGNED_CERT_IN_CHAIN' ||
        (issuerCert !== undefined &&
          issuerCert.fingerprint256 === cert.fingerprint256));
    let hostnameMatches = false;
    if (!empty) {
      hostnameMatches = tls.checkServerIdentity(pin.host, cert) === undefined;
    }
    // authorized/authorizationError were computed against the IP; recompute the
    // chain verdict against the hostname with a validating connection.
    let authorized = false;
    let authorizationError: string | null = null;
    try {
      const strict = await connectOnce(
        pin,
        port,
        { rejectUnauthorized: true },
        10_000,
      );
      authorized = true;
      strict.destroy();
    } catch (error) {
      authorizationError =
        (error as NodeJS.ErrnoException).code ?? (error as Error).message;
    }
    return {
      protocol: socket.getProtocol(),
      cipher: socket.getCipher()?.name ?? null,
      authorized,
      authorizationError,
      subject: empty ? null : distinguishedName(cert),
      issuer: empty
        ? null
        : ((cert.issuer as unknown as Record<string, string>)?.CN ?? null),
      validFrom: empty ? null : cert.valid_from,
      validTo: empty ? null : cert.valid_to,
      keyBits: !empty && cert.modulus ? (cert.bits ?? null) : null,
      selfSigned,
      hostnameMatches,
      acceptsTls10: await acceptsLegacy(pin, port, 'TLSv1'),
      acceptsTls11: await acceptsLegacy(pin, port, 'TLSv1.1'),
    };
  } finally {
    socket.destroy();
  }
};

async function acceptsLegacy(
  pin: PinnedHost,
  port: number,
  version: 'TLSv1' | 'TLSv1.1',
): Promise<boolean | null> {
  try {
    const socket = await connectOnce(
      pin,
      port,
      { minVersion: version, maxVersion: version, ciphers: 'ALL:@SECLEVEL=0' },
      5_000,
    );
    socket.destroy();
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? '';
    const text = `${code} ${(error as Error).message ?? ''}`;
    // Raised locally, before anything was sent: this build of OpenSSL cannot
    // speak the protocol at all, so nothing was learned about the server.
    if (/no protocols available/i.test(text)) return null;
    // The server answered with a TLS alert: it refuses the old protocol.
    if (
      /alert|protocol version|wrong version|unsupported protocol|handshake failure/i.test(
        text,
      )
    )
      return false;
    // A reset or a timeout does not say whether the protocol is accepted.
    return null;
  }
}
