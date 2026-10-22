import { afterEach, describe, expect, it, jest } from '@jest/globals';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { NativeChecks } from './native-checks.js';
import {
  pinnedGet,
  type PinnedGet,
  type PinnedResponse,
  type TlsInfo,
} from './pinned-io.js';
import type { PinnedHost } from '../pin.util.js';

const pin: PinnedHost = {
  host: 'shop.example.org',
  ip: '93.184.216.34',
  family: 4,
};
const NOW = new Date('2026-10-22T00:00:00Z');

const hardened: PinnedResponse = {
  status: 200,
  headers: {
    'strict-transport-security': 'max-age=31536000',
    'content-security-policy': "default-src 'self'; frame-ancestors 'self'",
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'permissions-policy': 'camera=()',
  },
  setCookies: [],
};

const goodTls: TlsInfo = {
  protocol: 'TLSv1.3',
  cipher: 'TLS_AES_256_GCM_SHA384',
  authorized: true,
  authorizationError: null,
  subject: 'shop.example.org',
  issuer: 'CA',
  validFrom: 'Sep 1 00:00:00 2026 GMT',
  validTo: 'Dec 30 00:00:00 2026 GMT',
  keyBits: 2048,
  selfSigned: false,
  hostnameMatches: true,
  acceptsTls10: false,
  acceptsTls11: false,
};

function run(
  get: PinnedGet,
  origins: string[],
  tls = jest.fn(async () => goodTls),
) {
  const logs: string[] = [];
  const checks = new NativeChecks({ get, tls, now: () => NOW });
  return {
    logs,
    tls,
    result: checks.run({
      pin,
      origins,
      signal: new AbortController().signal,
      onLog: (_level, message) => logs.push(message),
    }),
  };
}

describe('NativeChecks', () => {
  it('a hardened HTTPS site with an HTTP redirect produces no findings', async () => {
    const get = jest.fn<PinnedGet>(async (request) =>
      request.scheme === 'http'
        ? {
            status: 301,
            headers: { location: 'https://shop.example.org/' },
            setCookies: [],
          }
        : hardened,
    );
    const { result } = run(get, [
      'https://shop.example.org',
      'http://shop.example.org',
    ]);
    const out = await result;
    expect(out.findings).toEqual([]);
    expect(out.reachable).toEqual([
      'https://shop.example.org',
      'http://shop.example.org',
    ]);
  });

  it('connects through the pin: every request is made for the pinned address', async () => {
    const get = jest.fn<PinnedGet>(async () => hardened);
    const { result, tls } = run(get, ['https://shop.example.org']);
    await result;
    for (const call of get.mock.calls) expect(call[0].pin).toEqual(pin);
    expect(tls).toHaveBeenCalledWith(
      expect.objectContaining({ pin, port: 443 }),
    );
  });

  it('reports the findings of an unhardened site once each', async () => {
    const get = jest.fn<PinnedGet>(async () => ({
      status: 200,
      headers: { server: 'Apache/2.4.41' },
      setCookies: ['session=abc'],
    }));
    const { result } = run(get, ['https://shop.example.org']);
    const out = await result;
    const types = out.findings.map((f) => f.vulnType);
    expect(types).toEqual(
      expect.arrayContaining([
        'header-csp-missing',
        'disclosure-server-version',
        'cookie-no-secure:session',
      ]),
    );
    expect(new Set(out.findings.map((f) => f.dedupKey)).size).toBe(
      out.findings.length,
    );
    for (const f of out.findings) {
      expect(f.data.remediation).toEqual(expect.any(String));
      expect(f.scannerVersion).toBeNull();
    }
  });

  it('uses the TLS probe result', async () => {
    const get = jest.fn<PinnedGet>(async () => hardened);
    const { result } = run(
      get,
      ['https://shop.example.org'],
      jest.fn(async () => ({ ...goodTls, validTo: 'Oct 1 00:00:00 2026 GMT' })),
    );
    expect((await result).findings.map((f) => f.vulnType)).toEqual([
      'tls-cert-expired',
    ]);
  });

  it('probes CORS with a made-up origin and with null', async () => {
    const origins: string[] = [];
    const get = jest.fn<PinnedGet>(async (request) => {
      if (request.headers?.origin) {
        origins.push(request.headers.origin);
        return {
          ...hardened,
          headers: {
            ...hardened.headers,
            'access-control-allow-origin': request.headers.origin,
            'access-control-allow-credentials': 'true',
          },
        };
      }
      return hardened;
    });
    const out = await run(get, ['https://shop.example.org']).result;
    expect(origins).toEqual(['https://secora-cors-probe.invalid', 'null']);
    expect(out.findings.map((f) => f.vulnType)).toEqual(
      expect.arrayContaining([
        'cors-reflected-credentials',
        'cors-null-origin',
      ]),
    );
  });

  it('flags a site that is only available over plain HTTP', async () => {
    const get = jest.fn<PinnedGet>(async (request) => {
      if (request.scheme === 'https') throw new Error('connect ECONNREFUSED');
      return hardened;
    });
    const { result, logs } = run(get, [
      'https://shop.example.org',
      'http://shop.example.org',
    ]);
    const out = await result;
    expect(out.findings.map((f) => f.vulnType)).toContain('https-unavailable');
    expect(out.reachable).toEqual(['http://shop.example.org']);
    expect(logs.some((line) => line.includes('did not answer'))).toBe(true);
  });

  it('flags HTTP that does not redirect to HTTPS', async () => {
    const get = jest.fn<PinnedGet>(async () => hardened);
    const out = await run(get, [
      'https://shop.example.org',
      'http://shop.example.org',
    ]).result;
    expect(out.findings.map((f) => f.vulnType)).toContain(
      'http-no-redirect-to-https',
    );
  });

  it('survives a failed TLS probe and a host that does not answer at all', async () => {
    const get = jest.fn<PinnedGet>(async () => hardened);
    const failing = jest.fn(async () => {
      throw new Error('handshake failed');
    });
    const { result, logs } = run(get, ['https://shop.example.org'], failing);
    expect((await result).findings).toEqual([]);
    expect(logs.some((line) => line.includes('TLS inspection'))).toBe(true);

    const dead = jest.fn<PinnedGet>(async () => {
      throw new Error('timed out');
    });
    const out = await run(dead, ['https://shop.example.org']).result;
    expect(out).toMatchObject({ findings: [], reachable: [] });
  });

  it('stops when the job is cancelled and caps the number of origins', async () => {
    const get = jest.fn<PinnedGet>(async () => hardened);
    const controller = new AbortController();
    controller.abort();
    const checks = new NativeChecks({
      get,
      tls: jest.fn(async () => goodTls),
      now: () => NOW,
    });
    const aborted = await checks.run({
      pin,
      origins: ['https://shop.example.org'],
      signal: controller.signal,
      onLog: () => undefined,
    });
    expect(aborted.reachable).toEqual([]);
    expect(get).not.toHaveBeenCalled();

    const many = Array.from(
      { length: 9 },
      (_, i) => `http://shop.example.org:${8000 + i}`,
    );
    await new NativeChecks({
      get,
      tls: jest.fn(async () => goodTls),
      now: () => NOW,
    }).run({
      pin,
      origins: many,
      signal: new AbortController().signal,
      onLog: () => undefined,
    });
    const ports = new Set(get.mock.calls.map((call) => call[0].port));
    expect(ports.size).toBeLessThanOrEqual(4);
  });
});

describe('pinnedGet (real sockets)', () => {
  let server: http.Server | undefined;
  afterEach(async () => {
    await new Promise((resolve) =>
      server ? server.close(resolve) : resolve(undefined),
    );
    server = undefined;
  });

  it('connects to the pinned address, sends the real Host header and does not follow redirects', async () => {
    let seenHost = '';
    server = http.createServer((req, res) => {
      seenHost = String(req.headers.host);
      res
        .writeHead(302, {
          location: 'http://evil.test/',
          'set-cookie': ['a=1; HttpOnly', 'b=2'],
          server: 'lab/1.0',
        })
        .end();
    });
    await new Promise<void>((resolve) =>
      server!.listen(0, '127.0.0.1', resolve),
    );
    const port = (server.address() as AddressInfo).port;

    // The name does not resolve anywhere: only the pin can have made this work.
    const response = await pinnedGet({
      pin: { host: 'nowhere.lab.test', ip: '127.0.0.1', family: 4 },
      scheme: 'http',
      port,
      path: '/',
    });
    expect(seenHost).toBe(`nowhere.lab.test:${port}`);
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('http://evil.test/');
    expect(response.setCookies).toEqual(['a=1; HttpOnly', 'b=2']);
    expect(response.headers.server).toBe('lab/1.0');
  });
});
