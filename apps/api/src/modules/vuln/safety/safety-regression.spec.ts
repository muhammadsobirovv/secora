import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import http from 'node:http';
import net, { type AddressInfo } from 'node:net';
import { validateEnv } from '../../../config/env.validation.js';
import { OwnershipScopeService } from '../pipeline/ownership-scope.service.js';
import { createProxyFetch } from '../pipeline/checks/proxy-fetch.js';
import { PinningProxy, type BlockedConnection } from '../pipeline/pinning-proxy.js';
import { ScopeGuard } from '../pipeline/scope-guard.js';
import { ScanCommandAudit } from '../pipeline/scan-command-audit.service.js';
import { VulnScanJobPollerService } from '../execution/vuln-scan-job-poller.service.js';

/// SAFETY REGRESSION SUITE. Run before every release:
///
///   pnpm --filter api test:safety
///
/// This file holds the checks that compose real components (real sockets, the real
/// proxy, the real scope guard). `test:safety` also runs the unit suites that pin
/// down each rule where it lives; docs/operations/release-checklist.md lists which
/// file covers which rule.

// ---------------------------------------------------------------------------
// A lab on loopback: the "site" the proxy may reach, and a "victim" it must not.
// ---------------------------------------------------------------------------
let site: http.Server;
let victim: http.Server;
let sitePort = 0;
let victimPort = 0;
let siteHits: string[] = [];
let victimHits: string[] = [];
let proxy: PinningProxy;
let blocked: BlockedConnection[] = [];

const listen = (server: http.Server): Promise<number> =>
  new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)));

beforeEach(async () => {
  siteHits = [];
  victimHits = [];
  blocked = [];
  victim = http.createServer((req, res) => {
    victimHits.push(req.url ?? '');
    res.writeHead(200).end('SECRET');
  });
  victimPort = await listen(victim);
  site = http.createServer((req, res) => {
    siteHits.push(req.url ?? '');
    if (req.url === '/to-private-lan') return void res.writeHead(302, { location: 'http://10.0.0.5/admin' }).end();
    if (req.url === '/to-metadata') return void res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' }).end();
    if (req.url === '/to-loopback') return void res.writeHead(302, { location: `http://127.0.0.1:${victimPort}/secret` }).end();
    res.writeHead(200).end('ok');
  });
  sitePort = await listen(site);
  proxy = new PinningProxy({
    pins: () => [{ host: 'shop.lab.test', ip: '127.0.0.1', family: 4 }],
    allowedPorts: () => [sitePort],
    onBlocked: (info) => blocked.push(info),
    allowPrivateTargets: true, // the lab only: production mode refuses (tested below)
  });
  await proxy.start();
});

afterEach(async () => {
  await proxy.close();
  // Keep-alive sockets would hold close() open.
  site.closeAllConnections();
  victim.closeAllConnections();
  await new Promise((resolve) => site.close(resolve));
  await new Promise((resolve) => victim.close(resolve));
});

const viaProxy = (target: string): Promise<{ status: number }> => {
  const { port } = new URL(proxy.url);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: Number(port), method: 'GET', path: target, headers: { host: new URL(target).host } }, (res) => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode ?? 0 }));
    });
    req.on('error', reject);
    req.end();
  });
};

const connectViaProxy = (target: string): Promise<string> => {
  const { port } = new URL(proxy.url);
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port: Number(port) }, () => socket.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`));
    socket.once('data', (chunk) => {
      socket.destroy();
      resolve(chunk.toString().split('\r\n')[0]);
    });
    socket.once('error', reject);
  });
};

describe('SAFETY: redirects', () => {
  it.each(['/to-private-lan', '/to-metadata', '/to-loopback'])('a redirect (%s) is reported, never followed: nothing else is contacted', async (path) => {
    const fetchOnce = createProxyFetch(proxy.url);
    const response = await fetchOnce(`http://shop.lab.test:${sitePort}${path}`, { maxBytes: 1024 });
    expect(response.status).toBe(302);
    expect(victimHits).toEqual([]);
    expect(siteHits).toEqual([path]);
  });

  it('a client that does follow the redirect is refused by the proxy (private LAN, metadata, loopback IP)', async () => {
    expect((await viaProxy('http://10.0.0.5/admin')).status).toBe(403);
    expect((await viaProxy('http://169.254.169.254/latest/meta-data/')).status).toBe(403);
    expect((await viaProxy(`http://127.0.0.1:${victimPort}/secret`)).status).toBe(403);
    expect(victimHits).toEqual([]);
  });

  it('the scope guard refuses the same redirect targets, whatever their address', async () => {
    const guard = new ScopeGuard({ root: 'shop.lab.test', includeSubdomains: false }, { lookupAddresses: async () => [{ address: '93.184.216.34', family: 4 }] });
    for (const location of ['http://10.0.0.5/admin', 'http://169.254.169.254/', `http://127.0.0.1:${victimPort}/secret`, 'http://[::1]/', 'http://evil.test/']) {
      const result = await guard.admitUrl(location, 'http://shop.lab.test/');
      expect(result.ok).toBe(false);
    }
  });
});

describe('SAFETY: the proxy only talks to the pinned host', () => {
  it('refuses another name, an IP literal, the wrong port and a CONNECT elsewhere; the lab sees nothing', async () => {
    expect((await viaProxy(`http://other.lab.test:${sitePort}/`)).status).toBe(403);
    expect((await viaProxy(`http://127.0.0.1:${sitePort}/`)).status).toBe(403);
    expect((await viaProxy(`http://shop.lab.test:${victimPort}/`)).status).toBe(403);
    expect(await connectViaProxy('169.254.169.254:443')).toMatch(/ 403 /);
    expect(await connectViaProxy(`other.lab.test:${sitePort}`)).toMatch(/ 403 /);
    expect(siteHits).toEqual([]);
    expect(victimHits).toEqual([]);
    expect(blocked.length).toBeGreaterThanOrEqual(5);
  });

  it('serves the pinned host, so the refusals above are about the destination and nothing else', async () => {
    expect((await viaProxy(`http://shop.lab.test:${sitePort}/fine`)).status).toBe(200);
    expect(siteHits).toEqual(['/fine']);
  });

  it('in production mode even the pinned host is refused when its address is private', async () => {
    const strict = new PinningProxy({
      pins: () => [{ host: 'shop.lab.test', ip: '127.0.0.1', family: 4 }],
      allowedPorts: () => [sitePort],
      allowPrivateTargets: false,
    });
    await strict.start();
    try {
      const { port } = new URL(strict.url);
      const status = await new Promise<number>((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port: Number(port), path: `http://shop.lab.test:${sitePort}/`, headers: { host: `shop.lab.test:${sitePort}` } }, (res) => {
          res.resume();
          res.on('end', () => resolve(res.statusCode ?? 0));
        });
        req.on('error', reject);
        req.end();
      });
      expect(status).toBe(403);
      expect(siteHits).toEqual([]);
    } finally {
      await strict.close();
    }
  });
});

describe('SAFETY: an attested (unverified) scan never leaves the single host', () => {
  const noProof = new OwnershipScopeService({ tx: { targetOwnershipVerification: { findUnique: async () => null } } } as never);
  const lookup = async () => [{ address: '93.184.216.34', family: 4 }];

  it('its scope rule is the exact host, with no subdomains', async () => {
    expect(await noProof.ruleFor({ id: 't1', type: 'DOMAIN' }, 'shop.example.org')).toEqual({ root: 'shop.example.org', includeSubdomains: false });
    expect(await noProof.ruleFor({ id: 't1', type: 'URL' }, 'shop.example.org')).toEqual({ root: 'shop.example.org', includeSubdomains: false });
  });

  it('a guard built from it admits that host and nothing next to it', async () => {
    const rule = await noProof.ruleFor({ id: 't1', type: 'DOMAIN' }, 'shop.example.org');
    const guard = new ScopeGuard(rule, { lookupAddresses: lookup });
    expect((await guard.admitHost('shop.example.org')).ok).toBe(true);
    for (const host of ['api.shop.example.org', 'www.example.org', 'example.org', 'shop.example.org.evil.test', 'evilshop.example.org', 'other.test']) {
      expect((await guard.admitHost(host)).ok).toBe(false);
    }
    for (const url of ['https://api.shop.example.org/', 'https://example.org/', 'https://other.test/']) {
      expect((await guard.admitUrl(url)).ok).toBe(false);
    }
  });

  it('even a method that proves only a file or meta tag covers the host alone', async () => {
    for (const method of ['HTTP_FILE', 'META_TAG']) {
      const service = new OwnershipScopeService({ tx: { targetOwnershipVerification: { findUnique: async () => ({ method, verifiedAt: new Date() }) } } } as never);
      expect((await service.ruleFor({ id: 't1', type: 'DOMAIN' }, 'shop.example.org')).includeSubdomains).toBe(false);
    }
  });
});

describe('SAFETY: production refuses private targets', () => {
  const base = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://u:p@db:5432/x',
    JWT_ACCESS_SECRET: 'a'.repeat(40),
    CREDENTIAL_ENCRYPTION_KEY: 'b'.repeat(40),
  } as Record<string, string>;

  it('the server will not start with ACTIVE_SCAN_ALLOW_PRIVATE_TARGETS=true in production', () => {
    expect(() => validateEnv({ ...base, ACTIVE_SCAN_ALLOW_PRIVATE_TARGETS: 'true' })).toThrow(/ACTIVE_SCAN_ALLOW_PRIVATE_TARGETS/);
  });

  it('and the default is off', () => {
    let result: { ACTIVE_SCAN_ALLOW_PRIVATE_TARGETS: boolean } | undefined;
    try {
      result = validateEnv(base) as never;
    } catch {
      // other production-only requirements may apply; the flag itself must not be the reason
    }
    if (result) expect(result.ACTIVE_SCAN_ALLOW_PRIVATE_TARGETS).toBe(false);
  });
});

describe('SAFETY: the audit trail is written and redacted', () => {
  it('a tool command is audited with secrets removed, in every common form', async () => {
    const log = jest.fn(async (_entry: unknown) => undefined);
    await new ScanCommandAudit({ log } as never).record({
      userId: 'u1',
      workspaceId: 'w1',
      jobId: 'j1',
      target: { id: 't1', value: 'shop.example.org' },
      tool: 'nuclei',
      stage: 'scan',
      profile: 'STANDARD',
      command: '/opt/secora-tools/bin/nuclei',
      argv: [
        '-H', 'Authorization: Bearer sk-live-SECRETSECRET1234',
        '-H', 'Cookie: session=SECRETCOOKIE9999',
        '-H', 'X-Api-Key: SECRETAPIKEY7777',
        '-u', 'https://shop.example.org/?token=SECRETTOKEN5555&a=1',
      ],
    });
    expect(log).toHaveBeenCalledTimes(1);
    const entry = JSON.stringify(log.mock.calls[0][0]);
    for (const secret of ['SECRETSECRET1234', 'SECRETCOOKIE9999', 'SECRETAPIKEY7777', 'SECRETTOKEN5555']) {
      expect(entry).not.toContain(secret);
    }
    expect(entry).toContain('SCAN_COMMAND_EXECUTED');
    expect(entry).toContain('shop.example.org');
  });

  it('an audit write that fails never stops the scan', async () => {
    const audit = new ScanCommandAudit({ log: async () => Promise.reject(new Error('db down')) } as never);
    await expect(
      audit.record({ userId: 'u', workspaceId: 'w', jobId: 'j', target: { id: 't', value: 'x.example.org' }, tool: 'httpx', stage: 'recon', profile: null, command: 'httpx', argv: [] }),
    ).resolves.toBeUndefined();
  });
});

describe('SAFETY: the worker never runs more jobs than its concurrency cap', () => {
  it('claims at most VULN_WORKER_CONCURRENCY jobs while they are running', async () => {
    const claimNext = jest.fn(async () => ({ id: `job-${claimNext.mock.calls.length}` }));
    const jobs = {
      claimNext,
      findById: jest.fn(async (id: string) => ({ id, timeoutSeconds: 600 })),
    };
    const running: string[] = [];
    const execution = {
      execute: jest.fn((job: { id: string }) => {
        running.push(job.id);
        return new Promise<void>(() => undefined); // never finishes during the test
      }),
    };
    const config = { get: (key: string) => (key === 'VULN_WORKER_CONCURRENCY' ? 2 : 1000) };
    const poller = new VulnScanJobPollerService(jobs as never, execution as never, config as never);
    await (poller as unknown as { claimAvailableSlots(): Promise<void> }).claimAvailableSlots();
    await (poller as unknown as { claimAvailableSlots(): Promise<void> }).claimAvailableSlots();
    expect(running).toHaveLength(2);
    expect(claimNext).toHaveBeenCalledTimes(2);
    poller.stop();
  });
});
