/* eslint-disable @typescript-eslint/no-unsafe-member-access -- in-memory stand-in for a Prisma delegate */
import { describe, expect, it, jest } from '@jest/globals';
import { RoeCoverageService } from './roe-coverage.service.js';

type Asset = { host: string; type: string; wildcard: boolean };
interface Row {
  id: string;
  workspaceId: string;
  requestedBy: string;
  clientName: string;
  status: string;
  windowStart: Date;
  windowEnd: Date;
  approvedAt: Date | null;
  assets: Asset[];
}

const NOW = new Date('2026-10-23T10:00:00Z');
const hour = 3_600_000;

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: 'roe-1',
    workspaceId: 'ws-1',
    requestedBy: 'user-1',
    clientName: 'Acme',
    status: 'ACTIVE',
    windowStart: new Date(NOW.getTime() - hour),
    windowEnd: new Date(NOW.getTime() + hour),
    approvedAt: new Date(NOW.getTime() - 30 * 60_000),
    assets: [{ host: 'acme.example', type: 'DOMAIN', wildcard: false }],
    ...overrides,
  };
}

function build(rows: Row[]) {
  const findMany = jest.fn(async ({ where }: { where: Record<string, any> }) =>
    rows.filter(
      (r) =>
        r.workspaceId === where.workspaceId &&
        r.requestedBy === where.requestedBy &&
        r.status === where.status &&
        r.windowStart <= where.windowStart.lte &&
        r.windowEnd > where.windowEnd.gt,
    ),
  );
  const findUnique = jest.fn(async ({ where }: { where: { id: string } }) => rows.find((r) => r.id === where.id) ?? null);
  const service = new RoeCoverageService({ tx: { roeAuthorization: { findMany, findUnique } } } as never);
  return service;
}

const domain = (value: string) => ({ type: 'DOMAIN', value });

describe('findActiveCovering', () => {
  it('covers the listed asset itself', async () => {
    const service = build([row()]);
    const hit = await service.findActiveCovering(domain('acme.example'), 'ws-1', 'user-1', NOW);
    expect(hit).toMatchObject({ roeId: 'roe-1', rule: { root: 'acme.example', includeSubdomains: false } });
  });

  it('does not cover subdomains unless the wildcard was approved', async () => {
    const plain = build([row()]);
    expect(await plain.findActiveCovering(domain('app.acme.example'), 'ws-1', 'user-1', NOW)).toBeNull();
    const wild = build([row({ assets: [{ host: 'acme.example', type: 'DOMAIN', wildcard: true }] })]);
    const hit = await wild.findActiveCovering(domain('app.acme.example'), 'ws-1', 'user-1', NOW);
    expect(hit?.rule).toEqual({ root: 'acme.example', includeSubdomains: true });
  });

  it('never covers lookalike or parent domains', async () => {
    const wild = build([row({ assets: [{ host: 'acme.example', type: 'DOMAIN', wildcard: true }] })]);
    for (const value of ['acme.example.evil.test', 'evilacme.example', 'example', 'acme.example.']) {
      const hit = await wild.findActiveCovering(domain(value), 'ws-1', 'user-1', NOW);
      // the trailing-dot form is the same host and is allowed; the others are not
      expect(hit === null).toBe(value !== 'acme.example.');
    }
  });

  it('a URL asset covers its own host only, never subdomains, even with the flag set', async () => {
    const service = build([row({ assets: [{ host: 'app.acme.example', type: 'URL', wildcard: true }] })]);
    const own = await service.findActiveCovering({ type: 'URL', value: 'https://app.acme.example/login' }, 'ws-1', 'user-1', NOW);
    expect(own?.rule).toEqual({ root: 'app.acme.example', includeSubdomains: false });
    expect(await service.findActiveCovering(domain('x.app.acme.example'), 'ws-1', 'user-1', NOW)).toBeNull();
  });

  it('ignores the window edges, other workspaces, other users and non-active statuses', async () => {
    const service = build([row()]);
    expect(await service.findActiveCovering(domain('acme.example'), 'ws-1', 'user-1', new Date(NOW.getTime() + 2 * hour))).toBeNull();
    expect(await service.findActiveCovering(domain('acme.example'), 'ws-1', 'user-1', new Date(NOW.getTime() - 2 * hour))).toBeNull();
    expect(await service.findActiveCovering(domain('acme.example'), 'ws-2', 'user-1', NOW)).toBeNull();
    expect(await service.findActiveCovering(domain('acme.example'), 'ws-1', 'user-2', NOW)).toBeNull();
    for (const status of ['PENDING', 'DECLINED', 'REVOKED', 'EXPIRED', 'CANCELLED']) {
      expect(await build([row({ status })]).findActiveCovering(domain('acme.example'), 'ws-1', 'user-1', NOW)).toBeNull();
    }
  });

  it('IP addresses, CIDR ranges and unsupported types are never covered, whatever the assets say', async () => {
    const service = build([row({ assets: [{ host: 'acme.example', type: 'DOMAIN', wildcard: true }] })]);
    for (const target of [
      { type: 'IP_ADDRESS', value: '93.184.216.34' },
      { type: 'CIDR', value: '93.184.216.0/24' },
      { type: 'URL', value: 'http://93.184.216.34/' },
      { type: 'DOMAIN', value: '93.184.216.34' },
    ]) {
      expect(await service.findActiveCovering(target, 'ws-1', 'user-1', NOW)).toBeNull();
    }
  });
});

describe('assertStillValid', () => {
  it('is ok while active, in the window and covering', async () => {
    const result = await build([row()]).assertStillValid('roe-1', domain('acme.example'), NOW);
    expect(result.ok).toBe(true);
  });

  it.each([
    ['REVOKED', { status: 'REVOKED' }],
    ['NOT_ACTIVE', { status: 'CANCELLED' }],
    ['NOT_ACTIVE', { status: 'PENDING' }],
    ['EXPIRED', { windowEnd: new Date(NOW.getTime() - 1) }],
    ['NOT_YET', { windowStart: new Date(NOW.getTime() + 1) }],
  ] as const)('reports %s', async (reason, overrides) => {
    const result = await build([row(overrides)]).assertStillValid('roe-1', domain('acme.example'), NOW);
    expect(result).toEqual({ ok: false, reason });
  });

  it('reports NOT_COVERED when the target is outside the approved assets, and MISSING for an unknown id', async () => {
    const service = build([row()]);
    expect(await service.assertStillValid('roe-1', domain('other.example'), NOW)).toEqual({ ok: false, reason: 'NOT_COVERED' });
    expect(await service.assertStillValid('nope', domain('acme.example'), NOW)).toEqual({ ok: false, reason: 'MISSING' });
  });

  it('treats an ACTIVE row past its window end as expired even though nothing flipped the status', async () => {
    const result = await build([row()]).assertStillValid('roe-1', domain('acme.example'), new Date(NOW.getTime() + 5 * hour));
    expect(result).toEqual({ ok: false, reason: 'EXPIRED' });
  });
});
