import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import http from 'node:http';
import net, { type AddressInfo } from 'node:net';
import { PinningProxy, type BlockedConnection } from './pinning-proxy.js';
import type { PinnedHost } from './pin.util.js';

/// Real sockets on 127.0.0.1: a fake "site" the proxy is allowed to reach, and
/// raw HTTP/CONNECT clients standing in for katana/ffuf/dalfox.

let site: http.Server;
let sitePort: number;
let proxy: PinningProxy;
let blocked: BlockedConnection[];
let pins: PinnedHost[];

function startSite(): Promise<void> {
  site = http.createServer((req, res) => {
    if (req.url === '/redirect') {
      res.writeHead(302, { location: 'http://evil.test/phish' }).end();
      return;
    }
    res
      .writeHead(200, { 'content-type': 'text/plain' })
      .end(`host=${req.headers.host} path=${req.url}`);
  });
  return new Promise((resolve) =>
    site.listen(0, '127.0.0.1', () => {
      sitePort = (site.address() as AddressInfo).port;
      resolve();
    }),
  );
}

function proxyRequest(
  target: string,
): Promise<{
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}> {
  const { port } = new URL(proxy.url);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: Number(port),
        method: 'GET',
        path: target,
        headers: { host: new URL(target).host },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => (body += chunk.toString()));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body }),
        );
      },
    );
    req.on('error', reject);
    req.end();
  });
}

function connect(
  target: string,
): Promise<{ statusLine: string; socket: net.Socket }> {
  const { port } = new URL(proxy.url);
  return new Promise((resolve, reject) => {
    const socket = net.connect(
      { host: '127.0.0.1', port: Number(port) },
      () => {
        socket.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`);
      },
    );
    socket.once('data', (chunk) =>
      resolve({ statusLine: chunk.toString().split('\r\n')[0], socket }),
    );
    socket.once('error', reject);
  });
}

beforeEach(async () => {
  await startSite();
  blocked = [];
  pins = [{ host: 'app.lab.test', ip: '127.0.0.1', family: 4 }];
  proxy = new PinningProxy({
    pins: () => pins,
    allowedPorts: () => [sitePort],
    onBlocked: (info) => blocked.push(info),
    allowPrivateTargets: true,
  });
  await proxy.start();
});

afterEach(async () => {
  await proxy.close();
  await new Promise((resolve) => site.close(resolve));
});

describe('PinningProxy', () => {
  it('relays a request to an admitted host through its pinned address, keeping the Host header', async () => {
    const result = await proxyRequest(
      `http://app.lab.test:${sitePort}/page?a=1`,
    );
    expect(result.status).toBe(200);
    expect(result.body).toBe(`host=app.lab.test:${sitePort} path=/page?a=1`);
    expect(blocked).toEqual([]);
  });

  it('blocks a host that was never admitted, even though it would resolve', async () => {
    const result = await proxyRequest(`http://other.lab.test:${sitePort}/`);
    expect(result.status).toBe(403);
    expect(blocked).toEqual([
      {
        host: 'other.lab.test',
        port: sitePort,
        reason: 'host not admitted for this scan',
      },
    ]);
  });

  it('does not follow a redirect to another host, and a client that tries is blocked', async () => {
    const first = await proxyRequest(
      `http://app.lab.test:${sitePort}/redirect`,
    );
    expect(first.status).toBe(302);
    expect(first.headers.location).toBe('http://evil.test/phish');
    const second = await proxyRequest(first.headers.location as string);
    expect(second.status).toBe(403);
    expect(blocked.map((entry) => entry.host)).toEqual(['evil.test']);
  });

  it('refuses IP literals, even the pinned address itself', async () => {
    const result = await proxyRequest(`http://127.0.0.1:${sitePort}/`);
    expect(result.status).toBe(403);
    expect(blocked[0]).toMatchObject({
      host: '127.0.0.1',
      reason: 'IP literal',
    });
  });

  it('refuses ports that are not allowed', async () => {
    const result = await proxyRequest(`http://app.lab.test:${sitePort + 1}/`);
    expect(result.status).toBe(403);
    expect(blocked[0]).toMatchObject({
      reason: `port ${sitePort + 1} not allowed`,
    });
  });

  it('opens a CONNECT tunnel only to an admitted host and pinned address', async () => {
    const ok = await connect(`app.lab.test:${sitePort}`);
    expect(ok.statusLine).toBe('HTTP/1.1 200 Connection Established');
    const reply = await new Promise<string>((resolve) => {
      ok.socket.once('data', (chunk) => resolve(chunk.toString()));
      ok.socket.write(
        `GET /tunnel HTTP/1.1\r\nHost: app.lab.test\r\nConnection: close\r\n\r\n`,
      );
    });
    expect(reply).toContain('path=/tunnel');
    ok.socket.destroy();

    const denied = await connect(`evil.test:${sitePort}`);
    expect(denied.statusLine).toBe('HTTP/1.1 403 Forbidden');
    expect(blocked.map((entry) => entry.host)).toEqual(['evil.test']);
  });

  it('refuses a CONNECT to a cloud metadata address', async () => {
    const denied = await connect('169.254.169.254:80');
    expect(denied.statusLine).toBe('HTTP/1.1 403 Forbidden');
  });

  it('uses hosts admitted after it started', async () => {
    pins.push({ host: 'late.lab.test', ip: '127.0.0.1', family: 4 });
    const result = await proxyRequest(`http://late.lab.test:${sitePort}/`);
    expect(result.status).toBe(200);
  });

  it('refuses a pinned private address in production mode (allowPrivateTargets off)', async () => {
    const strict = new PinningProxy({
      pins: () => pins,
      allowedPorts: () => [sitePort],
      onBlocked: (info) => blocked.push(info),
    });
    await strict.start();
    try {
      const { port } = new URL(strict.url);
      const status = await new Promise<number>((resolve, reject) => {
        const req = http.request(
          {
            host: '127.0.0.1',
            port: Number(port),
            path: `http://app.lab.test:${sitePort}/`,
            headers: { host: 'app.lab.test' },
          },
          (res) => {
            res.resume();
            resolve(res.statusCode ?? 0);
          },
        );
        req.on('error', reject);
        req.end();
      });
      expect(status).toBe(403);
      expect(blocked[0]).toMatchObject({
        reason: 'pinned address is not public',
      });
    } finally {
      await strict.close();
    }
  });

  it('rejects a malformed CONNECT target', async () => {
    const result = await connect('no-port');
    expect(result.statusLine).toBe('HTTP/1.1 400 Bad Request');
  });
});
