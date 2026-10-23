import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PinningProxy } from '../pinning-proxy.js';
import { createProxyFetch } from './proxy-fetch.js';

const hasOpenssl = spawnSync('openssl', ['version']).status === 0;

let proxy: PinningProxy;
let httpServer: http.Server;
let httpsServer: https.Server | undefined;
let httpPort: number;
let httpsPort = 0;
let dir = '';

beforeAll(async () => {
  httpServer = http.createServer((req, res) => {
    if (req.url === '/redirect') {
      res.writeHead(302, { location: 'http://evil.test/' }).end();
      return;
    }
    res
      .writeHead(200, {
        'content-type': 'text/html',
        'x-seen-host': String(req.headers.host),
      })
      .end('x'.repeat(5000));
  });
  await new Promise<void>((resolve) =>
    httpServer.listen(0, '127.0.0.1', resolve),
  );
  httpPort = (httpServer.address() as AddressInfo).port;

  if (hasOpenssl) {
    dir = mkdtempSync(join(tmpdir(), 'secora-test-tls-'));
    const made = spawnSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        join(dir, 'k.pem'),
        '-out',
        join(dir, 'c.pem'),
        '-days',
        '1',
        '-subj',
        '/CN=tls.lab.test',
        '-addext',
        'subjectAltName=DNS:tls.lab.test',
      ],
      { env: { ...process.env, MSYS_NO_PATHCONV: '1' } },
    );
    if (made.status === 0) {
      httpsServer = https.createServer(
        {
          key: readFileSync(join(dir, 'k.pem')),
          cert: readFileSync(join(dir, 'c.pem')),
        },
        (_req, res) => {
          res
            .writeHead(200, {
              'content-type': 'text/plain',
              'strict-transport-security': 'max-age=1',
            })
            .end('secure body');
        },
      );
      await new Promise<void>((resolve) =>
        httpsServer!.listen(0, '127.0.0.1', resolve),
      );
      httpsPort = (httpsServer.address() as AddressInfo).port;
    }
  }

  proxy = new PinningProxy({
    pins: () => [
      { host: 'app.lab.test', ip: '127.0.0.1', family: 4 },
      { host: 'tls.lab.test', ip: '127.0.0.1', family: 4 },
    ],
    allowedPorts: () => [httpPort, httpsPort],
    allowPrivateTargets: true,
  });
  await proxy.start();
});

afterAll(async () => {
  await proxy.close();
  await new Promise((resolve) => httpServer.close(resolve));
  if (httpsServer) await new Promise((resolve) => httpsServer!.close(resolve));
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('createProxyFetch', () => {
  it('fetches an http URL through the proxy, with the real Host header, caps the body and lower-cases headers', async () => {
    const fetchOnce = createProxyFetch(proxy.url);
    const out = await fetchOnce(`http://app.lab.test:${httpPort}/page`, {
      maxBytes: 1000,
    });
    expect(out.status).toBe(200);
    expect(out.headers['content-type']).toBe('text/html');
    expect(out.headers['x-seen-host']).toBe(`app.lab.test:${httpPort}`);
    expect(out.body.length).toBe(1000);
  });

  it('does not follow a redirect', async () => {
    const out = await createProxyFetch(proxy.url)(
      `http://app.lab.test:${httpPort}/redirect`,
      { maxBytes: 1000 },
    );
    expect(out.status).toBe(302);
    expect(out.headers.location).toBe('http://evil.test/');
  });

  it('the proxy refuses a host that was not admitted, and the error says so', async () => {
    const out = await createProxyFetch(proxy.url)(
      `http://other.lab.test:${httpPort}/`,
      { maxBytes: 1000 },
    );
    expect(out.status).toBe(403);
    await expect(
      createProxyFetch(proxy.url)(
        `https://other.lab.test:${httpsPort || 443}/`,
        { maxBytes: 1000 },
      ),
    ).rejects.toThrow(/refused/);
  });

  (hasOpenssl ? it : it.skip)(
    'fetches an https URL through a CONNECT tunnel with a self-signed certificate',
    async () => {
      if (!httpsServer) return;
      const out = await createProxyFetch(proxy.url)(
        `https://tls.lab.test:${httpsPort}/`,
        { maxBytes: 1000 },
      );
      expect(out.status).toBe(200);
      expect(out.body).toBe('secure body');
      expect(out.headers['strict-transport-security']).toBe('max-age=1');
    },
  );

  it('only talks to the local pinning proxy', () => {
    expect(() => createProxyFetch('http://evil.test:8080')).toThrow(
      /pinning proxy/,
    );
  });
});
