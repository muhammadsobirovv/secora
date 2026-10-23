import { jest } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';
import { TARGET_ATTESTATION_VERSION } from '@pentesthub/shared';
import type { AuditService } from '../audit/audit.service.js';
import type { EnvConfig } from '../../config/env.validation.js';
import { TargetAuthorizationService } from './target-authorization.service.js';

interface AuthzRow {
  id: string;
  targetId: string | null;
  programId: string | null;
  workspaceId: string;
  createdBy: string;
  basis: 'OWNER' | 'WRITTEN_PERMISSION' | 'BUG_BOUNTY_SCOPE';
  documentReference: string | null;
  notes: string | null;
  attestationVersion: string;
  expiresAt: Date;
  ipAddress: string;
  userAgent: string;
  createdAt: Date;
}

interface Db {
  authorizations: AuthzRow[];
  ownership: { targetId: string; verifiedAt: Date | null }[];
  programLinks: { programId: string; targetId: string }[];
  scopeItems: {
    id: string;
    programId: string;
    type: string;
    pattern: string;
    classification: string;
  }[];
}

function newest(rows: AuthzRow[]): AuthzRow | null {
  return (
    [...rows].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    )[0] ?? null
  );
}

/// In-memory stand-in for the Prisma calls the service makes.
function buildService(db: Db, findActiveCovering: jest.Mock = jest.fn(async () => null)) {
  let seq = 0;
  const tx = {
    targetAuthorization: {
      create: jest.fn(({ data }: { data: Partial<AuthzRow> }) => {
        const row: AuthzRow = {
          id: `authz-${++seq}`,
          targetId: data.targetId ?? null,
          programId: data.programId ?? null,
          workspaceId: data.workspaceId!,
          createdBy: data.createdBy!,
          basis: data.basis!,
          documentReference: data.documentReference ?? null,
          notes: data.notes ?? null,
          attestationVersion: data.attestationVersion!,
          expiresAt: data.expiresAt!,
          ipAddress: data.ipAddress!,
          userAgent: data.userAgent!,
          createdAt: new Date(Date.now() + seq),
        };
        db.authorizations.push(row);
        return Promise.resolve(row);
      }),
      findFirst: jest.fn(
        ({
          where,
        }: {
          where: { targetId?: string | null; programId?: string };
        }) =>
          Promise.resolve(
            newest(
              db.authorizations.filter((r) =>
                where.programId !== undefined
                  ? r.programId === where.programId && r.targetId === null
                  : r.targetId === where.targetId,
              ),
            ),
          ),
      ),
    },
    targetOwnershipVerification: {
      findUnique: jest.fn(({ where }: { where: { targetId: string } }) =>
        Promise.resolve(
          db.ownership.find((o) => o.targetId === where.targetId) ?? null,
        ),
      ),
    },
    bugBountyProgramTarget: {
      findMany: jest.fn(({ where }: { where: { targetId: string } }) =>
        Promise.resolve(
          db.programLinks.filter((l) => l.targetId === where.targetId),
        ),
      ),
      count: jest.fn(({ where }: { where: { targetId: string } }) =>
        Promise.resolve(
          db.programLinks.filter((l) => l.targetId === where.targetId).length,
        ),
      ),
    },
    bugBountyProgramScopeItem: {
      findMany: jest.fn(({ where }: { where: { programId: string } }) =>
        Promise.resolve(
          db.scopeItems.filter((s) => s.programId === where.programId),
        ),
      ),
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
  const service = new TargetAuthorizationService(
    { tx } as never,
    auditService,
    configService,
    { findActiveCovering } as never,
  );
  return { service, auditService, tx, findActiveCovering };
}

function emptyDb(): Db {
  return { authorizations: [], ownership: [], programLinks: [], scopeItems: [] };
}

const user = 'user-1';
const workspaceId = 'ws-1';
const publicTarget = {
  id: 'target-1',
  type: 'IP_ADDRESS',
  value: '93.184.216.34',
};
const ctx = { ipAddress: '198.51.100.9', userAgent: 'jest' };
const auditTypes = (audit: jest.Mocked<AuditService>) =>
  audit.log.mock.calls.map((call) => (call[0] as { type: string }).type);

describe('TargetAuthorizationService', () => {
  it('blocks an active scan when the target has no attestation, and audits the block', async () => {
    const { service, auditService } = buildService(emptyDb());

    await expect(
      service.assertActiveScanAllowed({
        userId: user,
        workspaceId,
        target: publicTarget,
        operationType: 'VULN_SCAN',
        context: ctx,
      }),
    ).rejects.toMatchObject({
      code: 'TARGET_AUTHORIZATION_REQUIRED',
      status: 403,
    });
    expect(auditTypes(auditService)).toEqual(['ACTIVE_SCAN_BLOCKED']);
    expect(auditService.log.mock.calls[0]?.[0]).toMatchObject({
      userId: user,
      ipAddress: '198.51.100.9',
      metadata: {
        reason: 'AUTHORIZATION_MISSING',
        targetId: 'target-1',
        workspaceId,
      },
    });
  });

  it('writes an immutable attestation record and audit event, then allows the active scan', async () => {
    const db = emptyDb();
    const { service, auditService } = buildService(db);

    const authz = await service.attestTarget({
      userId: user,
      workspaceId,
      target: publicTarget,
      data: {
        basis: 'WRITTEN_PERMISSION',
        attested: true,
        documentReference: 'ROE-2026-17',
      },
      context: ctx,
    });

    expect(db.authorizations).toHaveLength(1);
    expect(db.authorizations[0]).toMatchObject({
      targetId: 'target-1',
      workspaceId,
      createdBy: user,
      basis: 'WRITTEN_PERMISSION',
      attestationVersion: TARGET_ATTESTATION_VERSION,
      ipAddress: '198.51.100.9',
    });
    // Default validity: about 12 months.
    const months =
      (db.authorizations[0].expiresAt.getTime() - Date.now()) /
      (30 * 24 * 3600 * 1000);
    expect(months).toBeGreaterThan(11.5);
    expect(months).toBeLessThan(12.5);
    expect(auditService.log.mock.calls[0]?.[0]).toMatchObject({
      type: 'TARGET_AUTHORIZATION_ATTESTED',
      userId: user,
      metadata: {
        targetId: 'target-1',
        basis: 'WRITTEN_PERMISSION',
        attestationVersion: TARGET_ATTESTATION_VERSION,
      },
    });

    db.ownership.push({ targetId: 'target-1', verifiedAt: new Date() });
    const used = await service.assertActiveScanAllowed({
      userId: user,
      workspaceId,
      target: publicTarget,
      operationType: 'VULN_SCAN',
      context: ctx,
    });
    expect(used.id).toBe(authz.id);

    await service.recordScanStarted({
      userId: user,
      workspaceId,
      target: publicTarget,
      operationType: 'VULN_SCAN',
      jobId: 'job-1',
      tools: ['NUCLEI'],
      active: true,
      authorization: used,
      context: ctx,
    });
    expect(auditService.log.mock.calls.at(-1)?.[0]).toMatchObject({
      type: 'SCAN_STARTED',
      ipAddress: '198.51.100.9',
      metadata: {
        jobId: 'job-1',
        mode: 'ACTIVE',
        basis: 'WRITTEN_PERMISSION',
        attestationVersion: TARGET_ATTESTATION_VERSION,
      },
    });
  });

  it('blocks an active scan on an attested target that has not proven ownership', async () => {
    const db = emptyDb();
    const { service, auditService } = buildService(db);
    await service.attestTarget({
      userId: user,
      workspaceId,
      target: publicTarget,
      data: { basis: 'WRITTEN_PERMISSION', attested: true },
    });
    await expect(
      service.assertActiveScanAllowed({
        userId: user,
        workspaceId,
        target: publicTarget,
        operationType: 'VULN_SCAN',
      }),
    ).rejects.toMatchObject({
      code: 'TARGET_OWNERSHIP_NOT_VERIFIED',
      status: 403,
    });
    expect(auditTypes(auditService)).toContain('ACTIVE_SCAN_BLOCKED');
  });

  it('refuses an attestation without the explicit checkbox', async () => {
    const db = emptyDb();
    const { service } = buildService(db);

    await expect(
      service.attestTarget({
        userId: user,
        workspaceId,
        target: publicTarget,
        data: { basis: 'OWNER', attested: false },
      }),
    ).rejects.toMatchObject({
      code: 'TARGET_AUTHORIZATION_ATTESTATION_REQUIRED',
    });
    expect(db.authorizations).toHaveLength(0);
  });

  it('blocks an active scan after the attestation has expired', async () => {
    const db = emptyDb();
    db.authorizations.push({
      id: 'old',
      targetId: 'target-1',
      programId: null,
      workspaceId,
      createdBy: user,
      basis: 'OWNER',
      documentReference: null,
      notes: null,
      attestationVersion: TARGET_ATTESTATION_VERSION,
      expiresAt: new Date(Date.now() - 1000),
      ipAddress: 'x',
      userAgent: 'x',
      createdAt: new Date(Date.now() - 10_000),
    });
    const { service } = buildService(db);

    await expect(
      service.assertActiveScanAllowed({
        userId: user,
        workspaceId,
        target: publicTarget,
        operationType: 'RECON_JOB',
      }),
    ).rejects.toMatchObject({
      code: 'TARGET_AUTHORIZATION_EXPIRED',
      status: 403,
    });
  });

  it('blocks a private IP and localhost even with a valid attestation', async () => {
    const db = emptyDb();
    const { service, auditService } = buildService(db);
    for (const target of [
      { id: 't-private', type: 'IP_ADDRESS', value: '10.0.0.5' },
      { id: 't-local', type: 'DOMAIN', value: 'localhost' },
    ]) {
      await service.attestTarget({
        userId: user,
        workspaceId,
        target,
        data: { basis: 'OWNER', attested: true },
      });
      await expect(
        service.assertActiveScanAllowed({
          userId: user,
          workspaceId,
          target,
          operationType: 'VULN_SCAN',
        }),
      ).rejects.toMatchObject({
        code: 'TARGET_FORBIDDEN_FOR_ACTIVE_SCAN',
        status: 403,
      });
    }
    expect(
      auditTypes(auditService).filter((t) => t === 'ACTIVE_SCAN_BLOCKED'),
    ).toHaveLength(2);
  });

  it('treats a bug bounty program scope attestation as authorization for in-scope linked targets only', async () => {
    const db = emptyDb();
    db.programLinks.push(
      { programId: 'prog-1', targetId: 'in-scope' },
      { programId: 'prog-1', targetId: 'out-of-scope' },
    );
    db.scopeItems.push(
      {
        id: 's1',
        programId: 'prog-1',
        type: 'WILDCARD',
        pattern: '*.example.com',
        classification: 'IN_SCOPE',
      },
      {
        id: 's2',
        programId: 'prog-1',
        type: 'DOMAIN',
        pattern: 'admin.example.com',
        classification: 'OUT_OF_SCOPE',
      },
    );
    const { service, auditService } = buildService(db);

    await service.attestProgramScope({
      userId: user,
      workspaceId,
      programId: 'prog-1',
      context: ctx,
    });
    expect(db.authorizations[0]).toMatchObject({
      programId: 'prog-1',
      targetId: null,
      basis: 'BUG_BOUNTY_SCOPE',
    });
    expect(auditTypes(auditService)).toEqual(['TARGET_AUTHORIZATION_ATTESTED']);

    const inScope = {
      id: 'in-scope',
      type: 'DOMAIN',
      value: 'app.example.com',
    };
    const status = await service.getStatus(inScope);
    expect(status).toMatchObject({
      authorized: true,
      current: { basis: 'BUG_BOUNTY_SCOPE', programId: 'prog-1' },
    });

    const outOfScope = {
      id: 'out-of-scope',
      type: 'DOMAIN',
      value: 'admin.example.com',
    };
    expect(await service.getStatus(outOfScope)).toMatchObject({
      authorized: false,
      reason: 'MISSING',
    });

    const unlinked = {
      id: 'unlinked',
      type: 'DOMAIN',
      value: 'www.example.com',
    };
    expect(await service.getStatus(unlinked)).toMatchObject({
      authorized: false,
    });
  });

  it('rejects an expiry in the past or beyond 36 months', async () => {
    const { service } = buildService(emptyDb());
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const far = new Date(Date.now() + 40 * 30 * 86_400_000).toISOString();
    for (const expiresAt of [past, far]) {
      await expect(
        service.attestTarget({
          userId: user,
          workspaceId,
          target: publicTarget,
          data: { basis: 'OWNER', attested: true, expiresAt },
        }),
      ).rejects.toMatchObject({ code: 'TARGET_AUTHORIZATION_INVALID' });
    }
  });

  describe('client engagement (ROE) path', () => {
    const site = { id: 'target-roe', type: 'DOMAIN', value: 'shop.example.org' };
    const coverage = {
      roeId: 'roe-1',
      clientName: 'Acme Ltd',
      windowStart: new Date(Date.now() - 3_600_000),
      windowEnd: new Date(Date.now() + 86_400_000),
      approvedAt: new Date(Date.now() - 1_800_000),
      rule: { root: 'shop.example.org', includeSubdomains: false },
    };
    const run = (service: TargetAuthorizationService, target = site, operationType = 'VULN_SCAN') =>
      service.assertActiveScanAllowed({ userId: user, workspaceId, target, operationType, context: ctx });

    it('lets an approved engagement stand in for attestation and ownership, and says which one', async () => {
      const { service, auditService, findActiveCovering } = buildService(emptyDb(), jest.fn(async () => coverage));
      const result = await run(service);
      expect(result.roeId).toBe('roe-1');
      expect(result.basis).toBe('WRITTEN_PERMISSION');
      expect(result.documentReference).toBe('ROE:roe-1');
      expect(findActiveCovering).toHaveBeenCalledWith(site, workspaceId, user);
      expect(auditTypes(auditService)).toEqual(['ROE_SCAN_AUTHORIZED']);
    });

    it('still blocks when no engagement covers the target', async () => {
      const { service } = buildService(emptyDb());
      await expect(run(service)).rejects.toMatchObject({ code: 'TARGET_AUTHORIZATION_REQUIRED' });
    });

    it('never lets an engagement bypass the network guard', async () => {
      const covered = jest.fn(async () => coverage);
      for (const value of ['app.localhost', 'portal.gov.uz']) {
        const { service } = buildService(emptyDb(), covered);
        await expect(run(service, { id: 't', type: 'DOMAIN', value })).rejects.toMatchObject({
          code: 'TARGET_FORBIDDEN_FOR_ACTIVE_SCAN',
        });
      }
    });

    it('is only consulted for vulnerability scans', async () => {
      const { service, findActiveCovering } = buildService(emptyDb(), jest.fn(async () => coverage));
      await expect(run(service, site, 'RECON_ACTIVE')).rejects.toMatchObject({ code: 'TARGET_AUTHORIZATION_REQUIRED' });
      expect(findActiveCovering).not.toHaveBeenCalled();
    });

    it('prefers verified ownership when the user has both', async () => {
      const db = emptyDb();
      const { service, findActiveCovering } = buildService(db, jest.fn(async () => coverage));
      await service.attestTarget({
        userId: user,
        workspaceId,
        target: site,
        data: { basis: 'OWNER', attested: true },
        context: ctx,
      });
      db.ownership.push({ targetId: site.id, verifiedAt: new Date() });
      const result = await run(service);
      expect(result.roeId).toBeUndefined();
      expect(findActiveCovering).not.toHaveBeenCalled();
    });
  });
});
