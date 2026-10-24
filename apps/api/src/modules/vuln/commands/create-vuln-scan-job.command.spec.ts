import { describe, expect, it, jest } from '@jest/globals';
import { EventBus } from '@nestjs/cqrs';
import type { ConfigService } from '@nestjs/config';
import type { WorkspacesRepository } from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import type { ProjectsRepository } from '../../projects/domain/repositories/projects.repository.interface.js';
import type { TargetsRepository } from '../../targets/domain/repositories/targets.repository.interface.js';
import type { VulnScanJobsRepository } from '../domain/repositories/vuln-scan-jobs.repository.interface.js';
import type { VulnScanTemplatesRepository } from '../domain/repositories/vuln-scan-templates.repository.interface.js';
import type { Target, Workspace } from '../../../prisma-types.js';
import type { ScopeEngineService } from '../../security/scope-engine.service.js';
import type { QuotaService } from '../../billing/quota.service.js';
import type { UsageService } from '../../billing/usage.service.js';
import { CreateVulnScanJobCommand, CreateVulnScanJobHandler } from './create-vuln-scan-job.command.js';
import type { ScanAdmissionService } from '../pipeline/scan-admission.service.js';
import type { TargetAuthorizationService } from '../../target-authorization/target-authorization.service.js';

function buildTarget(overrides?: Partial<Target>): Target {
  return {
    id: 'target-1',
    projectId: 'project-1',
    type: 'DOMAIN',
    value: 'example.com',
    name: null,
    description: null,
    environment: 'UNKNOWN',
    scopeStatus: 'PENDING_REVIEW',
    customFields: null,
    createdBy: 'user-1',
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Target;
}

/// A complete persisted job as the repository returns it (the DTO mapper
/// reads its timestamps).
function buildJob(id: string) {
  return {
    id,
    workspaceId: 'workspace-1',
    projectId: 'project-1',
    targetId: 'target-1',
    scanners: ['NUCLEI'],
    status: 'PENDING',
    toolRuns: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function buildWorkspace(overrides?: Partial<Workspace>): Workspace {
  return {
    id: 'workspace-1',
    name: 'Test workspace',
    slug: 'test-workspace',
    avatarUrl: null,
    description: null,
    plan: null,
    organizationId: null,
    teamId: null,
    isDemo: false,
    demoExpiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Workspace;
}

function buildHandler(opts: {
  workspace: Workspace;
  create: jest.Mock;
  target?: Target;
  scopeAssert?: jest.Mock;
  /// Module 20 — Phase 8. Same "unlimited by default" reasoning as
  /// create-recon-job.command.spec.ts.
  enforceForWorkspace?: jest.Mock;
  usageRecord?: jest.Mock;
  /// Target authorization gate; authorized by default.
  assertActiveScanAllowed?: jest.Mock;
  /// Scan admission (rate limits); allowed by default.
  admission?: jest.Mock;
  /// SCAN_DEEP_PROFILE_ENABLED; off by default, like the real env default.
  deepEnabled?: boolean;
}) {
  const workspacesRepository: WorkspacesRepository = {
    create: jest.fn(),
    addMember: jest.fn(),
    findById: jest.fn(),
    findPersonalWorkspaceForUser: jest.fn(async () => opts.workspace) as unknown as WorkspacesRepository['findPersonalWorkspaceForUser'],
    update: jest.fn(),
    listMembers: jest.fn(),
    isMember: jest.fn(),
  };
  const projectsRepository: Partial<ProjectsRepository> = {
    findByIdForWorkspace: jest.fn(async () => ({ id: 'project-1' })) as unknown as ProjectsRepository['findByIdForWorkspace'],
  };
  const targetsRepository: Partial<TargetsRepository> = {
    findById: jest.fn(async () => opts.target ?? buildTarget()) as unknown as TargetsRepository['findById'],
  };
  const vulnScanJobsRepository: Partial<VulnScanJobsRepository> = {
    create: opts.create as unknown as VulnScanJobsRepository['create'],
  };
  const vulnScanTemplatesRepository: Partial<VulnScanTemplatesRepository> = {
    findByIdForWorkspace: jest.fn(),
  };
  const configService = {
    get: jest.fn((key: string) => (key === 'SCAN_DEEP_PROFILE_ENABLED' ? (opts.deepEnabled ?? false) : 1800)),
  } as unknown as ConfigService;
  const eventBus = { publish: jest.fn() } as unknown as EventBus;
  const assertExecutionAllowed = opts.scopeAssert ?? jest.fn(async () => ({ decision: 'ALLOWED' }));
  const scopeEngine: Partial<ScopeEngineService> = {
    assertExecutionAllowed: assertExecutionAllowed as unknown as ScopeEngineService['assertExecutionAllowed'],
  };
  const enforceForWorkspace = opts.enforceForWorkspace ?? jest.fn(async () => ({ organizationId: null }));
  const quota: Partial<QuotaService> = {
    enforceForWorkspace: enforceForWorkspace as unknown as QuotaService['enforceForWorkspace'],
  };
  const usageRecord = opts.usageRecord ?? jest.fn(async () => undefined);
  const usage: Partial<UsageService> = {
    record: usageRecord as unknown as UsageService['record'],
  };

  const assertActiveScanAllowed =
    opts.assertActiveScanAllowed ??
    jest.fn(() =>
      Promise.resolve({
        id: 'authz-1',
        basis: 'OWNER',
        attestationVersion: 'v',
      }),
    );
  const recordScanStarted = jest.fn(() => Promise.resolve(undefined));
  const targetAuthorization = {
    assertActiveScanAllowed,
    recordScanStarted,
  } as unknown as TargetAuthorizationService;

  const assertAllowed = opts.admission ?? jest.fn(() => Promise.resolve(undefined));
  const scanAdmission = { assertAllowed } as unknown as ScanAdmissionService;

  const handler = new CreateVulnScanJobHandler(
    workspacesRepository,
    projectsRepository as ProjectsRepository,
    targetsRepository as TargetsRepository,
    vulnScanJobsRepository as VulnScanJobsRepository,
    vulnScanTemplatesRepository as VulnScanTemplatesRepository,
    configService,
    eventBus,
    scopeEngine as ScopeEngineService,
    quota as QuotaService,
    usage as UsageService,
    targetAuthorization,
    scanAdmission,
  );
  return {
    handler,
    vulnScanJobsRepository,
    eventBus,
    assertExecutionAllowed,
    enforceForWorkspace,
    usageRecord,
    assertActiveScanAllowed,
    recordScanStarted,
    assertAllowed,
  };
}

describe('CreateVulnScanJobHandler', () => {
  // Module 15 — task #352 (demo mode). Same guard as
  // CreateReconJobHandler, same reasoning: a demo workspace must never
  // start a real vulnerability scan.

  it('rejects job creation for a demo workspace before touching the repository', async () => {
    const create = jest.fn();
    const { handler, vulnScanJobsRepository, eventBus } = buildHandler({
      workspace: buildWorkspace({ isDemo: true }),
      create,
    });

    await expect(
      handler.execute(new CreateVulnScanJobCommand('user-1', 'target-1', { scanners: ['NUCLEI'] })),
    ).rejects.toMatchObject({ code: 'DEMO_WORKSPACE_READ_ONLY' });

    expect(vulnScanJobsRepository.create).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('creates the job normally for a non-demo workspace', async () => {
    const create = jest.fn(async () => buildJob('job-1'));
    const { handler, vulnScanJobsRepository } = buildHandler({
      workspace: buildWorkspace({ isDemo: false }),
      create,
    });

    const result = await handler.execute(
      new CreateVulnScanJobCommand('user-1', 'target-1', { scanners: ['NUCLEI'] }),
    );

    expect(vulnScanJobsRepository.create).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('job-1');
  });

  // Target authorization layer: every scanner is active, so a scan is
  // refused before any job exists when the target has no valid
  // attestation, and a started scan is recorded with its authorization.

  it('blocks the scan before creating a job when the target has no valid authorization', async () => {
    const create = jest.fn();
    const assertActiveScanAllowed = jest.fn(() =>
      Promise.reject(
        Object.assign(new Error('authorization required'), {
          code: 'TARGET_AUTHORIZATION_REQUIRED',
          status: 403,
        }),
      ),
    );
    const { handler, vulnScanJobsRepository, eventBus, recordScanStarted } =
      buildHandler({
        workspace: buildWorkspace({ isDemo: false }),
        create,
        assertActiveScanAllowed,
      });

    await expect(
      handler.execute(
        new CreateVulnScanJobCommand('user-1', 'target-1', {
          scanners: ['NUCLEI'],
        }),
      ),
    ).rejects.toMatchObject({ code: 'TARGET_AUTHORIZATION_REQUIRED' });

    expect(vulnScanJobsRepository.create).not.toHaveBeenCalled();
    expect(recordScanStarted).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('records the scan start with the authorization and caller IP once the job exists', async () => {
    const create = jest.fn(() => Promise.resolve(buildJob('job-9')));
    const { handler, recordScanStarted } = buildHandler({
      workspace: buildWorkspace({ isDemo: false }),
      create,
    });

    await handler.execute(
      new CreateVulnScanJobCommand(
        'user-1',
        'target-1',
        { scanners: ['NUCLEI'] },
        { ipAddress: '203.0.113.5', userAgent: 'jest' },
      ),
    );

    expect(recordScanStarted).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job-9',
        active: true,
        operationType: 'VULN_SCAN',
        authorization: expect.objectContaining({ id: 'authz-1' }),
        context: { ipAddress: '203.0.113.5', userAgent: 'jest' },
      }),
    );
  });

  // Module 16 — Scope Engine (task #370). Same security regression
  // coverage as create-recon-job.command.spec.ts — see that file's
  // comment for why this matters for AI Investigation Mode specifically.

  it('rejects job creation when the Scope Engine denies an out-of-scope target', async () => {
    const create = jest.fn();
    const scopeAssert = jest.fn(async () => {
      throw { code: 'TARGET_OUT_OF_SCOPE', message: 'out of scope' };
    });
    const { handler, vulnScanJobsRepository, eventBus } = buildHandler({
      workspace: buildWorkspace({ isDemo: false }),
      create,
      scopeAssert,
    });

    await expect(
      handler.execute(new CreateVulnScanJobCommand('user-1', 'target-1', { scanners: ['NUCLEI'] })),
    ).rejects.toMatchObject({ code: 'TARGET_OUT_OF_SCOPE' });

    expect(vulnScanJobsRepository.create).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('rejects job creation when the Scope Engine denies a pending-review target', async () => {
    const create = jest.fn();
    const scopeAssert = jest.fn(async () => {
      throw { code: 'TARGET_SCOPE_PENDING_REVIEW', message: 'pending review' };
    });
    const { handler, vulnScanJobsRepository, eventBus } = buildHandler({
      workspace: buildWorkspace({ isDemo: false }),
      create,
      target: buildTarget({ scopeStatus: 'PENDING_REVIEW' }),
      scopeAssert,
    });

    await expect(
      handler.execute(new CreateVulnScanJobCommand('user-1', 'target-1', { scanners: ['NUCLEI'] })),
    ).rejects.toMatchObject({ code: 'TARGET_SCOPE_PENDING_REVIEW' });

    expect(vulnScanJobsRepository.create).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  // Module 20 — Phase 8 (billing finalization). Same `SCANNER_JOBS` quota
  // gate regression coverage as create-recon-job.command.spec.ts.

  it('rejects job creation when the SCANNER_JOBS quota is exceeded, before touching the repository', async () => {
    const create = jest.fn();
    const enforceForWorkspace = jest.fn(async () => {
      throw { code: 'QUOTA_EXCEEDED', message: 'quota exceeded' };
    });
    const { handler, vulnScanJobsRepository, eventBus } = buildHandler({
      workspace: buildWorkspace({ isDemo: false }),
      create,
      enforceForWorkspace,
    });

    await expect(
      handler.execute(new CreateVulnScanJobCommand('user-1', 'target-1', { scanners: ['NUCLEI'] })),
    ).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });

    expect(enforceForWorkspace).toHaveBeenCalledWith('workspace-1', 'user-1', 'SCANNER_JOBS');
    expect(vulnScanJobsRepository.create).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('records SCANNER_JOBS usage against the resolved organizationId after a successful job creation', async () => {
    const create = jest.fn(async () => buildJob('job-1'));
    const enforceForWorkspace = jest.fn(async () => ({ organizationId: 'org-1' }));
    const { handler, usageRecord } = buildHandler({
      workspace: buildWorkspace({ isDemo: false }),
      create,
      enforceForWorkspace,
    });

    await handler.execute(new CreateVulnScanJobCommand('user-1', 'target-1', { scanners: ['NUCLEI'] }));
    await Promise.resolve();

    expect(usageRecord).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1', workspaceId: 'workspace-1', resourceType: 'SCANNER_JOBS', quantity: 1 }),
    );
  });

  // Scan admission and profiles (pentest pipeline).

  it('refuses a scan that hits a rate limit before the plan quota is consumed or a job exists', async () => {
    const create = jest.fn();
    const admission = jest.fn(() =>
      Promise.reject(
        Object.assign(new Error('rate limited'), { code: 'SCAN_RATE_LIMITED', status: 429 }),
      ),
    );
    const { handler, vulnScanJobsRepository, enforceForWorkspace } = buildHandler({
      workspace: buildWorkspace({ isDemo: false }),
      create,
      admission,
    });

    await expect(
      handler.execute(new CreateVulnScanJobCommand('user-1', 'target-1', { scanners: ['NUCLEI'] })),
    ).rejects.toMatchObject({ code: 'SCAN_RATE_LIMITED', status: 429 });

    expect(enforceForWorkspace).not.toHaveBeenCalled();
    expect(vulnScanJobsRepository.create).not.toHaveBeenCalled();
  });

  it('stores the chosen profile in the job config for the worker', async () => {
    const create = jest.fn(async () => buildJob('job-1'));
    const { handler, vulnScanJobsRepository } = buildHandler({
      workspace: buildWorkspace({ isDemo: false }),
      create,
    });

    await handler.execute(
      new CreateVulnScanJobCommand('user-1', 'target-1', { scanners: ['NUCLEI'], profile: 'QUICK' }),
    );

    const input = (vulnScanJobsRepository.create as jest.Mock).mock.calls[0][0] as {
      config: Record<string, unknown>;
    };
    expect(input.config).toEqual({ profile: 'QUICK' });
  });

  it('a profile job gets a timeout that covers all of its stage limits', async () => {
    const timeoutFor = async (profile?: 'QUICK' | 'STANDARD' | 'DEEP') => {
      const create = jest.fn(async () => buildJob('job-1'));
      const { handler, vulnScanJobsRepository } = buildHandler({
        workspace: buildWorkspace({ isDemo: false }),
        create,
        deepEnabled: true,
      });
      await handler.execute(
        new CreateVulnScanJobCommand('user-1', 'target-1', {
          scanners: ['NUCLEI'],
          profile,
          confirmDeep: profile === 'DEEP',
        }),
      );
      return (vulnScanJobsRepository.create as jest.Mock).mock.calls[0][0] as { timeoutSeconds: number };
    };
    // The test environment's VULN_JOB_TIMEOUT_SECONDS is 1800.
    expect((await timeoutFor()).timeoutSeconds).toBe(1800);
    expect((await timeoutFor('QUICK')).timeoutSeconds).toBe(1800);
    expect((await timeoutFor('STANDARD')).timeoutSeconds).toBe(50 * 60);
    expect((await timeoutFor('DEEP')).timeoutSeconds).toBe(100 * 60);
  });

  it('the profile decides which scanners run, not the request', async () => {
    const scannersFor = async (profile: 'QUICK' | 'STANDARD' | 'DEEP') => {
      const create = jest.fn(async () => buildJob('job-1'));
      const { handler, vulnScanJobsRepository } = buildHandler({
        workspace: buildWorkspace({ isDemo: false }),
        create,
        deepEnabled: true,
      });
      await handler.execute(
        new CreateVulnScanJobCommand('user-1', 'target-1', {
          scanners: ['NIKTO', 'FEROXBUSTER'], // ignored: the profile picks
          profile,
          confirmDeep: profile === 'DEEP',
        }),
      );
      return (vulnScanJobsRepository.create as jest.Mock).mock.calls[0][0] as { scanners: string[] };
    };
    expect((await scannersFor('QUICK')).scanners).toEqual(['SECORA_CHECKS']);
    expect((await scannersFor('STANDARD')).scanners).toEqual(['SECORA_CHECKS', 'NUCLEI']);
    expect((await scannersFor('DEEP')).scanners).toEqual(['SUBFINDER', 'NAABU', 'SECORA_CHECKS', 'NUCLEI', 'FFUF', 'DALFOX']);
  });

  it('refuses the DEEP profile unless the deployment enables it', async () => {
    const create = jest.fn();
    const off = buildHandler({ workspace: buildWorkspace({ isDemo: false }), create, deepEnabled: false });
    await expect(
      off.handler.execute(
        new CreateVulnScanJobCommand('user-1', 'target-1', { scanners: ['NUCLEI'], profile: 'DEEP' }),
      ),
    ).rejects.toMatchObject({ code: 'SCAN_PROFILE_DISABLED', status: 403 });
    expect(off.vulnScanJobsRepository.create).not.toHaveBeenCalled();

    const created = jest.fn(async () => buildJob('job-2'));
    const on = buildHandler({ workspace: buildWorkspace({ isDemo: false }), create: created, deepEnabled: true });
    await expect(
      on.handler.execute(
        new CreateVulnScanJobCommand('user-1', 'target-1', {
          scanners: ['NUCLEI'],
          profile: 'DEEP',
          confirmDeep: true,
        }),
      ),
    ).resolves.toBeDefined();
    const input = (on.vulnScanJobsRepository.create as jest.Mock).mock.calls[0][0] as {
      config: Record<string, unknown>;
    };
    expect(input.config).toEqual({ profile: 'DEEP', deepConfirmed: true });
  });

  it('refuses the DEEP profile without an explicit confirmation', async () => {
    const create = jest.fn();
    const { handler, vulnScanJobsRepository } = buildHandler({
      workspace: buildWorkspace({ isDemo: false }),
      create,
      deepEnabled: true,
    });
    for (const confirmDeep of [undefined, false]) {
      await expect(
        handler.execute(
          new CreateVulnScanJobCommand('user-1', 'target-1', {
            scanners: ['NUCLEI'],
            profile: 'DEEP',
            confirmDeep,
          }),
        ),
      ).rejects.toMatchObject({ code: 'SCAN_DEEP_CONFIRMATION_REQUIRED', status: 400 });
    }
    expect(vulnScanJobsRepository.create).not.toHaveBeenCalled();
  });

  describe('client engagement (ROE)', () => {
    const roeGate = () =>
      jest.fn(() => Promise.resolve({ id: 'roe:roe-1', basis: 'WRITTEN_PERMISSION', attestationVersion: 'v', roeId: 'roe-1' }));
    const configOf = (h: ReturnType<typeof buildHandler>) =>
      (h.vulnScanJobsRepository.create as jest.Mock).mock.calls[0][0] as { config: Record<string, unknown> | null };

    it('stores the engagement id in the job config so the worker can re-check it', async () => {
      const h = buildHandler({ workspace: buildWorkspace({ isDemo: false }), create: jest.fn(async () => buildJob('j')), assertActiveScanAllowed: roeGate() });
      await h.handler.execute(new CreateVulnScanJobCommand('user-1', 'target-1', { scanners: ['NUCLEI'], profile: 'STANDARD' }));
      expect(configOf(h).config).toEqual({ profile: 'STANDARD', roeId: 'roe-1' });
    });

    it('drops a roeId a caller smuggles in through config when no engagement authorized the scan', async () => {
      const h = buildHandler({ workspace: buildWorkspace({ isDemo: false }), create: jest.fn(async () => buildJob('j')) });
      await h.handler.execute(
        new CreateVulnScanJobCommand('user-1', 'target-1', { scanners: ['NUCLEI'], profile: 'QUICK', config: { roeId: 'someone-elses' } }),
      );
      expect(configOf(h).config).toEqual({ profile: 'QUICK' });
    });

    it('replaces a smuggled roeId with the one the gate actually used', async () => {
      const h = buildHandler({ workspace: buildWorkspace({ isDemo: false }), create: jest.fn(async () => buildJob('j')), assertActiveScanAllowed: roeGate() });
      await h.handler.execute(
        new CreateVulnScanJobCommand('user-1', 'target-1', { scanners: ['NUCLEI'], profile: 'QUICK', config: { roeId: 'forged' } }),
      );
      expect(configOf(h).config).toEqual({ profile: 'QUICK', roeId: 'roe-1' });
    });

    it('does not unlock DEEP: it still needs the deployment flag and the explicit confirmation', async () => {
      const off = buildHandler({ workspace: buildWorkspace({ isDemo: false }), create: jest.fn(), assertActiveScanAllowed: roeGate() });
      await expect(
        off.handler.execute(new CreateVulnScanJobCommand('user-1', 'target-1', { scanners: ['NUCLEI'], profile: 'DEEP', confirmDeep: true })),
      ).rejects.toMatchObject({ code: 'SCAN_PROFILE_DISABLED' });
      const noConfirm = buildHandler({ workspace: buildWorkspace({ isDemo: false }), create: jest.fn(), deepEnabled: true, assertActiveScanAllowed: roeGate() });
      await expect(
        noConfirm.handler.execute(new CreateVulnScanJobCommand('user-1', 'target-1', { scanners: ['NUCLEI'], profile: 'DEEP' })),
      ).rejects.toMatchObject({ code: 'SCAN_DEEP_CONFIRMATION_REQUIRED' });
      expect(off.vulnScanJobsRepository.create).not.toHaveBeenCalled();
      expect(noConfirm.vulnScanJobsRepository.create).not.toHaveBeenCalled();
    });

    it('creates no job when the gate refuses (engagement missing, expired or revoked)', async () => {
      const refuse = jest.fn(() => Promise.reject(Object.assign(new Error('required'), { code: 'TARGET_AUTHORIZATION_REQUIRED' })));
      const h = buildHandler({ workspace: buildWorkspace({ isDemo: false }), create: jest.fn(), assertActiveScanAllowed: refuse });
      await expect(
        h.handler.execute(new CreateVulnScanJobCommand('user-1', 'target-1', { scanners: ['NUCLEI'], profile: 'STANDARD' })),
      ).rejects.toThrow();
      expect(h.vulnScanJobsRepository.create).not.toHaveBeenCalled();
    });
  });
});

describe('CreateVulnScanJobHandler — owner attestation', () => {
  const gate = (attestedOnly: boolean) =>
    jest.fn(() => Promise.resolve({ id: 'authz-1', basis: 'OWNER', attestationVersion: 'v', ...(attestedOnly ? { attestedOnly: true } : {}) }));
  const configOf = (h: ReturnType<typeof buildHandler>) =>
    (h.vulnScanJobsRepository.create as jest.Mock).mock.calls[0][0] as { config: Record<string, unknown> | null };

  it('records that the scan ran on attestation only, and tells the gate when attestation may suffice', async () => {
    for (const profile of ['QUICK', 'STANDARD'] as const) {
      const h = buildHandler({ workspace: buildWorkspace({ isDemo: false }), create: jest.fn(async () => buildJob('j')), assertActiveScanAllowed: gate(true) });
      await h.handler.execute(new CreateVulnScanJobCommand('user-1', 'target-1', { scanners: ['NUCLEI'], profile }));
      expect(configOf(h).config).toEqual({ profile, attestedOnly: true });
      expect(h.assertActiveScanAllowed).toHaveBeenCalledWith(expect.objectContaining({ allowOwnerAttestation: true }));
    }
  });

  it('DEEP never asks the gate to accept attestation alone', async () => {
    const h = buildHandler({ workspace: buildWorkspace({ isDemo: false }), create: jest.fn(async () => buildJob('j')), deepEnabled: true, assertActiveScanAllowed: gate(false) });
    await h.handler.execute(new CreateVulnScanJobCommand('user-1', 'target-1', { scanners: ['NUCLEI'], profile: 'DEEP', confirmDeep: true }));
    expect(h.assertActiveScanAllowed).toHaveBeenCalledWith(expect.objectContaining({ allowOwnerAttestation: false }));
    expect(configOf(h).config).toEqual({ profile: 'DEEP', deepConfirmed: true });
  });

  it('a caller cannot claim or hide the flag through config', async () => {
    const verified = buildHandler({ workspace: buildWorkspace({ isDemo: false }), create: jest.fn(async () => buildJob('j')), assertActiveScanAllowed: gate(false) });
    await verified.handler.execute(new CreateVulnScanJobCommand('user-1', 'target-1', { scanners: ['NUCLEI'], profile: 'QUICK', config: { attestedOnly: true } }));
    expect(configOf(verified).config).toEqual({ profile: 'QUICK' });
    const attested = buildHandler({ workspace: buildWorkspace({ isDemo: false }), create: jest.fn(async () => buildJob('j')), assertActiveScanAllowed: gate(true) });
    await attested.handler.execute(new CreateVulnScanJobCommand('user-1', 'target-1', { scanners: ['NUCLEI'], profile: 'QUICK', config: { attestedOnly: false } }));
    expect(configOf(attested).config).toEqual({ profile: 'QUICK', attestedOnly: true });
  });
});
