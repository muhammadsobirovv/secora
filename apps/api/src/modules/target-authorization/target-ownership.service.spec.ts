import { jest } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';
import type { AuditService } from '../audit/audit.service.js';
import type { EnvConfig } from '../../config/env.validation.js';
import {
  NetworkOwnershipProbe,
  OwnershipNetworkBlockedError,
  type OwnershipProbe,
} from './target-ownership.probe.js';
import { TargetOwnershipService } from './target-ownership.service.js';

interface OwnershipRow {
  id: string;
  targetId: string;
  workspaceId: string;
  token: string;
  method: string | null;
  verifiedAt: Date | null;
  lastCheckedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/// A probe whose three sources are set per test. Every call is recorded so
/// tests can prove that nothing was fetched when the guard refused.
function fakeProbe(sources: {
  dns?: string[];
  httpFile?: { status: number; body: string };
  page?: { status: number; body: string };
  addresses?: string[];
  throws?: Error;
}) {
  const calls: string[] = [];
  const probe: OwnershipProbe = {
    resolveAddresses: jest.fn(async (host: string) => {
      calls.push(`resolve:${host}`);
      return sources.addresses ?? ['93.184.216.34'];
    }),
    dnsTxtValues: jest.fn(async (name: string) => {
      calls.push(`dns:${name}`);
      if (sources.throws) throw sources.throws;
      return sources.dns ?? [];
    }),
    fetchText: jest.fn(async (host: string, path: string) => {
      calls.push(`fetch:${host}${path}`);
      if (sources.throws) throw sources.throws;
      const file = sources.httpFile ?? { status: 404, body: '' };
      const page = sources.page ?? { status: 404, body: '' };
      return path === '/' ? page : file;
    }),
  };
  return { probe, calls };
}

function buildService(probe: OwnershipProbe) {
  const rows: OwnershipRow[] = [];
  let seq = 0;
  const tx = {
    targetOwnershipVerification: {
      findUnique: jest.fn(({ where }: { where: { targetId: string } }) =>
        Promise.resolve(rows.find((r) => r.targetId === where.targetId) ?? null),
      ),
      create: jest.fn(({ data }: { data: Partial<OwnershipRow> }) => {
        const now = new Date();
        const row: OwnershipRow = {
          id: `own-${++seq}`,
          targetId: data.targetId!,
          workspaceId: data.workspaceId!,
          token: data.token!,
          method: null,
          verifiedAt: null,
          lastCheckedAt: null,
          lastError: null,
          createdAt: now,
          updatedAt: now,
        };
        rows.push(row);
        return Promise.resolve(row);
      }),
      // Only the shape the interval claim uses: id + unverified + (never checked OR checked before a cutoff).
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string; OR: [unknown, { lastCheckedAt: { lt: Date } }] };
          data: Partial<OwnershipRow>;
        }) => {
          const row = rows.find((r) => r.id === where.id && !r.verifiedAt);
          const cutoff = where.OR[1].lastCheckedAt.lt;
          if (!row || (row.lastCheckedAt && row.lastCheckedAt >= cutoff)) return Promise.resolve({ count: 0 });
          Object.assign(row, data);
          return Promise.resolve({ count: 1 });
        },
      ),
      update: jest.fn(({ where, data }: { where: { id: string }; data: Partial<OwnershipRow> }) => {
        const row = rows.find((r) => r.id === where.id)!;
        Object.assign(row, data, { updatedAt: new Date() });
        return Promise.resolve(row);
      }),
    },
  };
  const auditService = {
    log: jest.fn(() => Promise.resolve(undefined)),
  } as unknown as jest.Mocked<AuditService>;
  const config: Record<string, unknown> = {
    ACTIVE_SCAN_ALLOW_PRIVATE_TARGETS: false,
    ACTIVE_SCAN_DENYLIST: 'gov.uz,mil.uz,gov,mil',
    ACTIVE_SCAN_ALLOWLIST: '',
  };
  const configService = {
    get: jest.fn((key: string) => config[key]),
  } as unknown as ConfigService<EnvConfig, true>;
  const service = new TargetOwnershipService(
    { tx } as never,
    auditService,
    probe,
    configService,
  );
  return { service, rows, auditService };
}

const user = 'user-1';
const workspaceId = 'ws-1';
const domain = { id: 'target-d', type: 'DOMAIN', value: 'shop.example.org' };
const auditTypes = (audit: jest.Mocked<AuditService>) =>
  audit.log.mock.calls.map((call) => (call[0] as { type: string }).type);

describe('TargetOwnershipService — challenge', () => {
  it('issues one token and reuses it on repeat calls, with all three instructions', async () => {
    const { probe } = fakeProbe({});
    const { service, rows } = buildService(probe);

    const first = await service.createChallenge({ userId: user, workspaceId, target: domain });
    const second = await service.createChallenge({ userId: user, workspaceId, target: domain });

    expect(rows).toHaveLength(1);
    expect(first.verified).toBe(false);
    expect(first.challenge).toEqual({
      dnsRecordName: '_secora-verify.shop.example.org',
      dnsRecordValue: `secora-verify=${rows[0].token}`,
      httpUrl: 'https://shop.example.org/.well-known/secora-verify.txt',
      metaTag: `<meta name="secora-verify" content="${rows[0].token}">`,
    });
    expect(second.challenge?.dnsRecordValue).toBe(first.challenge?.dnsRecordValue);
  });

  it('refuses target types that cannot prove a web or DNS identity', async () => {
    const { probe } = fakeProbe({});
    const { service } = buildService(probe);
    await expect(
      service.createChallenge({
        userId: user,
        workspaceId,
        target: { id: 't-ip', type: 'IP_ADDRESS', value: '93.184.216.34' },
      }),
    ).rejects.toMatchObject({ code: 'TARGET_OWNERSHIP_UNSUPPORTED', status: 400 });
  });
});

describe('TargetOwnershipService — verify', () => {
  it('verifies through the DNS TXT record and audits the success', async () => {
    const { probe } = fakeProbe({ dns: ['unrelated', 'secora-verify=tok-dns'] });
    const { service, rows, auditService } = buildService(probe);
    await service.createChallenge({ userId: user, workspaceId, target: domain });
    rows[0].token = 'tok-dns';

    const status = await service.verify({ userId: user, workspaceId, target: domain });

    expect(status).toMatchObject({ verified: true, method: 'DNS_TXT', challenge: null });
    expect(auditTypes(auditService)).toContain('TARGET_OWNERSHIP_VERIFIED');
  });

  it('falls back to the well-known file, then to the meta tag', async () => {
    const fileProbe = fakeProbe({ httpFile: { status: 200, body: 'tok-file\n' } });
    const fileSvc = buildService(fileProbe.probe);
    await fileSvc.service.createChallenge({ userId: user, workspaceId, target: domain });
    fileSvc.rows[0].token = 'tok-file';
    expect(
      (await fileSvc.service.verify({ userId: user, workspaceId, target: domain })).method,
    ).toBe('HTTP_FILE');

    const metaProbe = fakeProbe({
      page: {
        status: 200,
        // attributes in the reverse order are accepted too
        body: '<html><head><meta content="tok-meta" name="secora-verify"></head></html>',
      },
    });
    const metaSvc = buildService(metaProbe.probe);
    await metaSvc.service.createChallenge({ userId: user, workspaceId, target: domain });
    metaSvc.rows[0].token = 'tok-meta';
    expect(
      (await metaSvc.service.verify({ userId: user, workspaceId, target: domain })).method,
    ).toBe('META_TAG');
  });

  it('does not verify with a token that belongs to someone else', async () => {
    const { probe } = fakeProbe({
      dns: ['secora-verify=someone-else'],
      httpFile: { status: 200, body: 'someone-else' },
    });
    const { service, rows, auditService } = buildService(probe);
    await service.createChallenge({ userId: user, workspaceId, target: domain });

    const status = await service.verify({ userId: user, workspaceId, target: domain });

    expect(status.verified).toBe(false);
    expect(status.lastError).toBe('DNS_RECORD_NOT_FOUND');
    expect(rows[0].verifiedAt).toBeNull();
    expect(auditTypes(auditService)).toContain('TARGET_OWNERSHIP_CHECK_FAILED');
  });

  it('refuses a second check inside the minimum interval, without any network I/O', async () => {
    const { probe, calls } = fakeProbe({});
    const { service } = buildService(probe);
    await service.createChallenge({ userId: user, workspaceId, target: domain });
    const first = await service.verify({ userId: user, workspaceId, target: domain });
    expect(first.verified).toBe(false);
    const callsAfterFirst = calls.length;
    await expect(service.verify({ userId: user, workspaceId, target: domain })).rejects.toMatchObject({
      code: 'OWNERSHIP_CHECK_TOO_SOON',
    });
    expect(calls.length).toBe(callsAfterFirst);
  });

  it('allows the next check once the interval has passed', async () => {
    const { probe } = fakeProbe({});
    const { service, rows } = buildService(probe);
    await service.createChallenge({ userId: user, workspaceId, target: domain });
    await service.verify({ userId: user, workspaceId, target: domain });
    rows[0].lastCheckedAt = new Date(Date.now() - 25_000);
    const again = await service.verify({ userId: user, workspaceId, target: domain });
    expect(again.verified).toBe(false);
  });

  it('does not follow an HTTP error page as proof', async () => {
    const { probe } = fakeProbe({ httpFile: { status: 302, body: 'tok' } });
    const { service, rows } = buildService(probe);
    await service.createChallenge({ userId: user, workspaceId, target: domain });
    rows[0].token = 'tok';
    expect((await service.verify({ userId: user, workspaceId, target: domain })).verified).toBe(false);
  });

  it('keeps a verified target verified and never rotates its token', async () => {
    const { probe } = fakeProbe({ dns: [] });
    const { service, rows } = buildService(probe);
    await service.createChallenge({ userId: user, workspaceId, target: domain });
    rows[0].verifiedAt = new Date();
    rows[0].method = 'DNS_TXT';
    const before = rows[0].token;

    const again = await service.createChallenge({ userId: user, workspaceId, target: domain });

    expect(again.verified).toBe(true);
    expect(again.challenge).toBeNull();
    expect(rows[0].token).toBe(before);
  });

  it('reports NETWORK_BLOCKED when the host resolves to a private address', async () => {
    const { probe } = fakeProbe({ throws: new OwnershipNetworkBlockedError() });
    const { service } = buildService(probe);
    await service.createChallenge({ userId: user, workspaceId, target: domain });
    const status = await service.verify({ userId: user, workspaceId, target: domain });
    expect(status).toMatchObject({ verified: false, lastError: 'NETWORK_BLOCKED' });
  });

  it('refuses before any I/O when the network guard blocks the target', async () => {
    const { probe, calls } = fakeProbe({ addresses: ['10.0.0.5'] });
    const { service, auditService } = buildService(probe);
    const intranet = { id: 't-intranet', type: 'DOMAIN', value: 'intranet.example.org' };
    await service.createChallenge({ userId: user, workspaceId, target: intranet });

    await expect(
      service.verify({ userId: user, workspaceId, target: intranet }),
    ).rejects.toMatchObject({ code: 'TARGET_FORBIDDEN_FOR_ACTIVE_SCAN', status: 403 });

    expect(calls.filter((c) => c.startsWith('dns:') || c.startsWith('fetch:'))).toHaveLength(0);
    expect(auditTypes(auditService)).toContain('TARGET_OWNERSHIP_BLOCKED');
  });

  it('refuses localhost and government domains by name, without any lookup', async () => {
    const { probe, calls } = fakeProbe({});
    const { service } = buildService(probe);
    for (const target of [
      { id: 't-local', type: 'DOMAIN', value: 'localhost' },
      { id: 't-gov', type: 'DOMAIN', value: 'portal.gov' },
    ]) {
      await service.createChallenge({ userId: user, workspaceId, target });
      await expect(
        service.verify({ userId: user, workspaceId, target }),
      ).rejects.toMatchObject({ code: 'TARGET_FORBIDDEN_FOR_ACTIVE_SCAN' });
    }
    expect(calls).toHaveLength(0);
  });
});

describe('TargetOwnershipService — gate', () => {
  it('assertVerified throws until the target is verified', async () => {
    const { probe } = fakeProbe({});
    const { service, rows } = buildService(probe);
    await expect(service.assertVerified(domain)).rejects.toMatchObject({
      code: 'TARGET_OWNERSHIP_NOT_VERIFIED',
      status: 403,
    });
    await service.createChallenge({ userId: user, workspaceId, target: domain });
    rows[0].verifiedAt = new Date();
    await expect(service.assertVerified(domain)).resolves.toBeUndefined();
  });
});

describe('NetworkOwnershipProbe — pinning and rebinding', () => {
  it('refuses when ANY resolved address is private, before connecting', async () => {
    const probe = new NetworkOwnershipProbe(async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.5', family: 4 },
    ]);
    await expect(probe.fetchText('mixed.example.org', '/', 100)).rejects.toBeInstanceOf(
      OwnershipNetworkBlockedError,
    );
  });

  it('refuses metadata and loopback addresses', async () => {
    for (const address of ['169.254.169.254', '127.0.0.1', '::1']) {
      const probe = new NetworkOwnershipProbe(async () => [{ address, family: address.includes(':') ? 6 : 4 }]);
      await expect(probe.fetchText('rebind.example.org', '/', 100)).rejects.toBeInstanceOf(
        OwnershipNetworkBlockedError,
      );
    }
  });

  it('resolves addresses for the network guard through the same lookup', async () => {
    const probe = new NetworkOwnershipProbe(async () => [{ address: '93.184.216.34', family: 4 }]);
    await expect(probe.resolveAddresses('shop.example.org')).resolves.toEqual(['93.184.216.34']);
  });
});

describe('pinned lookup (real sockets)', () => {
  it('connects through the pinned address on this Node, whether the caller asks for one address or a list', async () => {
    const http = await import('node:http');
    const { pinnedLookup } = await import('./target-ownership.probe.js');
    const server = http.createServer((_req, res) => res.end('proof'));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    try {
      const status = await new Promise<number>((resolve, reject) => {
        const req = http.request(
          // the name resolves nowhere: only the pinned address can be used
          { host: 'proof-host.invalid', port, path: '/', lookup: pinnedLookup({ address: '127.0.0.1', family: 4 }) as never },
          (res) => {
            res.resume();
            resolve(res.statusCode ?? 0);
          },
        );
        req.on('error', reject);
        req.end();
      });
      expect(status).toBe(200);
    } finally {
      server.close();
    }
  });

  it('answers both call styles', () => {
    return import('./target-ownership.probe.js').then(({ pinnedLookup }) => {
      const lookup = pinnedLookup({ address: '93.184.216.34', family: 4 });
      const list = jest.fn();
      lookup('x', { all: true }, list);
      expect(list).toHaveBeenCalledWith(null, [{ address: '93.184.216.34', family: 4 }]);
      const single = jest.fn();
      lookup('x', {}, single);
      expect(single).toHaveBeenCalledWith(null, '93.184.216.34', 4);
    });
  });
});

describe('what a failed check is reported as', () => {
  const failing = (host: Error | null) => {
    const { probe } = fakeProbe({});
    // a probe whose web checks cannot run at all, while DNS answers (and has no record)
    (probe.fetchText as jest.Mock).mockImplementation(async () => {
      throw host ?? new Error('UNREACHABLE');
    });
    return probe;
  };

  it('a web check that could not run is never reported as "tag not found"', async () => {
    const { service } = buildService(failing(null));
    await service.createChallenge({ userId: user, workspaceId, target: domain });
    const status = await service.verify({ userId: user, workspaceId, target: domain });
    // DNS looked and found nothing: that is the message that tells the user what to do
    expect(status.lastError).toBe('DNS_RECORD_NOT_FOUND');
  });

  it('when nothing at all could be checked it says the site is unreachable', async () => {
    const probe = failing(null);
    (probe.dnsTxtValues as jest.Mock).mockImplementation(async () => {
      throw new Error('SERVFAIL');
    });
    const { service } = buildService(probe);
    await service.createChallenge({ userId: user, workspaceId, target: domain });
    expect((await service.verify({ userId: user, workspaceId, target: domain })).lastError).toBe('UNREACHABLE');
  });

  it('the file and the tag are named when only the web checks looked', async () => {
    const probe = fakeProbe({ httpFile: { status: 404, body: '' }, page: { status: 200, body: '<html></html>' } }).probe;
    (probe.dnsTxtValues as jest.Mock).mockImplementation(async () => {
      throw new Error('SERVFAIL');
    });
    const { service } = buildService(probe);
    await service.createChallenge({ userId: user, workspaceId, target: domain });
    expect((await service.verify({ userId: user, workspaceId, target: domain })).lastError).toBe('HTTP_FILE_NOT_FOUND');
  });
});
