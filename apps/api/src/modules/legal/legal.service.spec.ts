import { jest } from '@jest/globals';
import { LEGAL_VERSION } from '@pentesthub/shared';
import { LegalService } from './legal.service.js';
import type { AuditService } from '../audit/audit.service.js';

interface Row {
  userId: string;
  version: string;
  acceptedAt: Date;
}

/// In-memory stand-in for the legal_acceptances table, enforcing the same
/// unique (userId, version) constraint the database does.
function buildTxHost(rows: Row[]) {
  const legalAcceptance = {
    findUnique: jest.fn(
      ({
        where,
      }: {
        where: { userId_version: { userId: string; version: string } };
      }) => {
        const { userId, version } = where.userId_version;
        return Promise.resolve(
          rows.find((r) => r.userId === userId && r.version === version)
            ? { id: 'x' }
            : null,
        );
      },
    ),
    findFirst: jest.fn(({ where }: { where: { userId: string } }) => {
      const mine = rows
        .filter((r) => r.userId === where.userId)
        .sort((a, b) => b.acceptedAt.getTime() - a.acceptedAt.getTime());
      return Promise.resolve(mine[0] ? { version: mine[0].version } : null);
    }),
    create: jest.fn(
      ({ data }: { data: { userId: string; version: string } }) => {
        if (
          rows.some(
            (r) => r.userId === data.userId && r.version === data.version,
          )
        ) {
          return Promise.reject(new Error('unique violation'));
        }
        rows.push({
          userId: data.userId,
          version: data.version,
          acceptedAt: new Date(),
        });
        return Promise.resolve(data);
      },
    ),
  };
  return { txHost: { tx: { legalAcceptance } }, legalAcceptance };
}

function buildService(rows: Row[], version: string = LEGAL_VERSION) {
  const { txHost, legalAcceptance } = buildTxHost(rows);
  const auditService = {
    log: jest.fn(() => Promise.resolve(undefined)),
  } as unknown as jest.Mocked<AuditService>;
  class TestLegalService extends LegalService {
    protected override currentVersion(): string {
      return version;
    }
  }
  const service = new TestLegalService(txHost as never, auditService);
  return { service, auditService, legalAcceptance };
}

const ctx = { ipAddress: '203.0.113.7', userAgent: 'jest' };

describe('LegalService', () => {
  it('reports acceptance as required for a user who never accepted (existing users)', async () => {
    const { service } = buildService([]);

    const status = await service.getStatus('user-1');

    expect(status.acceptanceRequired).toBe(true);
    expect(status.acceptedVersion).toBeNull();
    expect(await service.hasAcceptedCurrentVersion('user-1')).toBe(false);
  });

  it('records acceptance once per version, with IP and user agent, and audits it', async () => {
    const rows: Row[] = [];
    const { service, auditService, legalAcceptance } = buildService(rows);

    await service.recordAcceptance({
      userId: 'user-1',
      version: LEGAL_VERSION,
      ...ctx,
    });
    await service.recordAcceptance({
      userId: 'user-1',
      version: LEGAL_VERSION,
      ...ctx,
    });

    expect(rows).toHaveLength(1);
    expect(legalAcceptance.create).toHaveBeenCalledTimes(1);
    expect(legalAcceptance.create.mock.calls[0]?.[0].data).toMatchObject({
      userId: 'user-1',
      version: LEGAL_VERSION,
      documents: ['terms', 'aup', 'privacy'],
      ipAddress: '203.0.113.7',
      userAgent: 'jest',
    });
    expect(auditService.log).toHaveBeenCalledTimes(1);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        type: 'LEGAL_ACCEPTED',
        ipAddress: '203.0.113.7',
      }),
    );
    expect((await service.getStatus('user-1')).acceptanceRequired).toBe(false);
  });

  it('forces re-acceptance after a version bump', async () => {
    const rows: Row[] = [
      { userId: 'user-1', version: '2026-01-01', acceptedAt: new Date() },
    ];
    const { service } = buildService(rows, '2026-12-01');

    const status = await service.getStatus('user-1');

    expect(status.acceptedVersion).toBe('2026-01-01');
    expect(status.currentVersion).toBe('2026-12-01');
    expect(status.acceptanceRequired).toBe(true);
    expect(await service.hasAcceptedCurrentVersion('user-1')).toBe(false);

    await service.recordAcceptance({
      userId: 'user-1',
      version: '2026-12-01',
      ...ctx,
    });

    expect(await service.hasAcceptedCurrentVersion('user-1')).toBe(true);
    expect(rows.map((r) => r.version)).toEqual(['2026-01-01', '2026-12-01']);
  });

  it('refuses to record acceptance of a version other than the current one', async () => {
    const rows: Row[] = [];
    const { service } = buildService(rows);

    await expect(
      service.recordAcceptance({
        userId: 'user-1',
        version: '2000-01-01',
        ...ctx,
      }),
    ).rejects.toMatchObject({ code: 'LEGAL_VERSION_MISMATCH' });
    expect(rows).toHaveLength(0);
  });
});
