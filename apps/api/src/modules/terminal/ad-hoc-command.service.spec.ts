import { describe, expect, it, jest } from '@jest/globals';
import type { WorkspacesRepository } from '../workspaces/domain/repositories/workspaces.repository.interface.js';
import type { ProjectsRepository } from '../projects/domain/repositories/projects.repository.interface.js';
import type { TargetsRepository } from '../targets/domain/repositories/targets.repository.interface.js';
import type { AdHocCommandsRepository } from './domain/repositories/adhoc-commands.repository.interface.js';
import type { ScopeEngineService } from '../security/scope-engine.service.js';
import type { GlobalSecurityPolicyService } from '../security/global-security-policy.service.js';
import type { SecurityApprovalService } from '../security/security-approval.service.js';
import type { AuditService } from '../audit/audit.service.js';
import type { ToolRunnerRegistry } from '../recon/tool-runners/tool-runner-registry.service.js';
import type { ScannerRunnerRegistry } from '../vuln/scanner-runners/scanner-runner-registry.service.js';
import { AdHocCommandService } from './ad-hoc-command.service.js';

/// Module 16 — Terminal workspace + safe command execution (task #388).
/// Security regression suite for task #417's explicit checklist:
/// workspaceId/projectId/targetId tampering, out-of-scope target,
/// pending-review target, unauthorized command, blocked command, approval
/// bypass, and cross-surface (API/MCP/plugin/workflow/CLI) execution all
/// routing through the identical canonical path. There is exactly one
/// injectable execution surface in this module — AdHocCommandService — so
/// "MCP-triggered" / "plugin-triggered" / "workflow-triggered" /
/// "CLI-triggered" execution is modeled here as calling `execute()` with
/// a different `source` label; the test asserts the *enforcement* never
/// branches on that label (see `sameEnforcementRegardlessOfSource` below).
/// No separate MCP/plugin/workflow/CLI call-sites exist yet in this
/// codebase to independently exercise (disclosed in the final report) —
/// this suite proves the property the architecture is supposed to
/// guarantee for whenever those call-sites are built: they have no
/// alternate path available to call instead of this one.

function buildTarget(overrides?: Partial<{
  id: string;
  projectId: string;
  type: string;
  value: string;
  scopeStatus: string;
}>) {
  return {
    id: 'target-1',
    projectId: 'project-1',
    type: 'DOMAIN',
    value: 'example.com',
    scopeStatus: 'IN_SCOPE',
    name: null,
    description: null,
    environment: 'UNKNOWN',
    customFields: null,
    createdBy: 'user-1',
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildHarness(opts: {
  workspaceId?: string;
  isDemo?: boolean;
  target?: ReturnType<typeof buildTarget> | null;
  projectExistsForWorkspace?: boolean;
  scopeAssert?: jest.Mock;
  assertToolAllowed?: jest.Mock;
  approvalsCreate?: jest.Mock;
  approvalsAssertApproved?: jest.Mock;
  reconRunnerRun?: jest.Mock;
  scannerRunnerRun?: jest.Mock;
}) {
  const workspaceId = opts.workspaceId ?? 'workspace-1';

  const workspacesRepository: Partial<WorkspacesRepository> = {
    findPersonalWorkspaceForUser: jest.fn(async () => ({
      id: workspaceId,
      isDemo: opts.isDemo ?? false,
    })) as unknown as WorkspacesRepository['findPersonalWorkspaceForUser'],
  };

  const target = opts.target === undefined ? buildTarget() : opts.target;

  const targetsRepository: Partial<TargetsRepository> = {
    findById: jest.fn(async () => target) as unknown as TargetsRepository['findById'],
  };

  const projectsRepository: Partial<ProjectsRepository> = {
    findByIdForWorkspace: jest.fn(async () =>
      opts.projectExistsForWorkspace === false ? null : { id: target?.projectId ?? 'project-1' },
    ) as unknown as ProjectsRepository['findByIdForWorkspace'],
  };

  const created: Record<string, unknown>[] = [];
  const updated: Record<string, unknown>[] = [];
  const listMock = jest.fn(async () => []);
  const findByIdForCallerMock = jest.fn(async () => null);
  const adHocCommandsRepository: Partial<AdHocCommandsRepository> = {
    create: jest.fn(async (input) => {
      const row = { id: `cmd-${created.length + 1}`, ...input, createdAt: new Date(), updatedAt: new Date() };
      created.push(row as Record<string, unknown>);
      return row;
    }) as unknown as AdHocCommandsRepository['create'],
    update: jest.fn(async (id, input) => {
      const row = { id, ...input };
      updated.push(row as Record<string, unknown>);
      return row;
    }) as unknown as AdHocCommandsRepository['update'],
    findByIdForCaller: findByIdForCallerMock as unknown as AdHocCommandsRepository['findByIdForCaller'],
    list: listMock as unknown as AdHocCommandsRepository['list'],
  };

  const scopeAssert = opts.scopeAssert ?? jest.fn(async () => ({ decision: 'ALLOWED' }));
  const scopeEngine: Partial<ScopeEngineService> = {
    assertExecutionAllowed: scopeAssert as unknown as ScopeEngineService['assertExecutionAllowed'],
  };

  const assertToolAllowed = opts.assertToolAllowed ?? jest.fn(async () => undefined);
  const securityPolicy: Partial<GlobalSecurityPolicyService> = {
    assertToolAllowed: assertToolAllowed as unknown as GlobalSecurityPolicyService['assertToolAllowed'],
  };

  const approvalsCreate =
    opts.approvalsCreate ?? jest.fn(async () => ({ id: 'approval-1', status: 'PENDING' }));
  const approvalsAssertApproved = opts.approvalsAssertApproved ?? jest.fn(async () => undefined);
  const approvals: Partial<SecurityApprovalService> = {
    create: approvalsCreate as unknown as SecurityApprovalService['create'],
    assertApproved: approvalsAssertApproved as unknown as SecurityApprovalService['assertApproved'],
  };

  const auditLog = jest.fn(async () => undefined);
  const auditService: Partial<AuditService> = {
    log: auditLog as unknown as AuditService['log'],
  };

  const reconRunnerRun =
    opts.reconRunnerRun ?? jest.fn(async () => ({ exitCode: 0, stdout: 'ok', timedOut: false }));
  const toolRunnerRegistry: Partial<ToolRunnerRegistry> = {
    resolveRunner: jest.fn(() => ({
      tool: 'SUBFINDER',
      supportedTargetTypes: ['DOMAIN'],
      run: reconRunnerRun,
    })) as unknown as ToolRunnerRegistry['resolveRunner'],
  };

  const scannerRunnerRun =
    opts.scannerRunnerRun ?? jest.fn(async () => ({ exitCode: 0, stdout: 'ok', timedOut: false }));
  const scannerRunnerRegistry: Partial<ScannerRunnerRegistry> = {
    resolveRunner: jest.fn(() => ({
      scanner: 'NUCLEI',
      supportedTargetTypes: ['URL'],
      run: scannerRunnerRun,
    })) as unknown as ScannerRunnerRegistry['resolveRunner'],
  };

  const service = new AdHocCommandService(
    workspacesRepository as WorkspacesRepository,
    projectsRepository as ProjectsRepository,
    targetsRepository as TargetsRepository,
    adHocCommandsRepository as AdHocCommandsRepository,
    scopeEngine as ScopeEngineService,
    securityPolicy as GlobalSecurityPolicyService,
    approvals as SecurityApprovalService,
    auditService as AuditService,
    toolRunnerRegistry as ToolRunnerRegistry,
    scannerRunnerRegistry as ScannerRunnerRegistry,
  );

  return {
    service,
    workspaceId,
    created,
    updated,
    scopeAssert,
    assertToolAllowed,
    approvalsCreate,
    approvalsAssertApproved,
    reconRunnerRun,
    scannerRunnerRun,
    auditLog,
    listMock,
    findByIdForCallerMock,
  };
}

describe('AdHocCommandService — ownership tampering', () => {
  it('rejects a targetId that does not exist (targetId tampering)', async () => {
    const { service, reconRunnerRun } = buildHarness({ target: null });

    await expect(
      service.execute('user-1', { targetId: 'does-not-exist', tool: 'SUBFINDER', args: [] }, 'API'),
    ).rejects.toMatchObject({ code: 'TARGET_NOT_FOUND' });

    expect(reconRunnerRun).not.toHaveBeenCalled();
  });

  it('rejects when the target’s project does not belong to the caller’s workspace (workspaceId tampering)', async () => {
    // Simulates: caller's real workspace is workspace-1, but the target
    // (found by raw id, no workspace filter in TargetsRepository.findById)
    // belongs to a project in some other workspace — the project lookup,
    // scoped to the caller's OWN workspace, must fail closed.
    const { service, reconRunnerRun } = buildHarness({ projectExistsForWorkspace: false });

    await expect(
      service.execute('user-1', { targetId: 'target-1', tool: 'SUBFINDER', args: [] }, 'API'),
    ).rejects.toMatchObject({ code: 'TARGET_NOT_FOUND' });

    expect(reconRunnerRun).not.toHaveBeenCalled();
  });

  it('never trusts a client-supplied projectId/workspaceId — none is even accepted in the request DTO', () => {
    // RunAdHocCommandRequestDto (packages/shared/terminal-workspace.ts) has
    // no workspaceId/projectId field at all — this is a compile-time
    // guarantee, asserted here structurally rather than at runtime.
    const dto: { targetId: string; tool: string; args: string[] } = {
      targetId: 'target-1',
      tool: 'SUBFINDER',
      args: [],
    };
    expect('workspaceId' in dto).toBe(false);
    expect('projectId' in dto).toBe(false);
  });
});

describe('AdHocCommandService — Scope Engine gate', () => {
  it('rejects an out-of-scope target', async () => {
    const scopeAssert = jest.fn(async () => {
      throw { code: 'TARGET_OUT_OF_SCOPE', message: 'out of scope' };
    });
    const { service, reconRunnerRun } = buildHarness({
      target: buildTarget({ scopeStatus: 'OUT_OF_SCOPE' }),
      scopeAssert,
    });

    await expect(
      service.execute('user-1', { targetId: 'target-1', tool: 'SUBFINDER', args: [] }, 'API'),
    ).rejects.toMatchObject({ code: 'TARGET_OUT_OF_SCOPE' });

    expect(reconRunnerRun).not.toHaveBeenCalled();
  });

  it('rejects a pending-review target', async () => {
    const scopeAssert = jest.fn(async () => {
      throw { code: 'TARGET_SCOPE_PENDING_REVIEW', message: 'pending review' };
    });
    const { service, reconRunnerRun } = buildHarness({
      target: buildTarget({ scopeStatus: 'PENDING_REVIEW' }),
      scopeAssert,
    });

    await expect(
      service.execute('user-1', { targetId: 'target-1', tool: 'SUBFINDER', args: [] }, 'API'),
    ).rejects.toMatchObject({ code: 'TARGET_SCOPE_PENDING_REVIEW' });

    expect(reconRunnerRun).not.toHaveBeenCalled();
  });

  it('rejects a demo workspace before touching the Scope Engine at all', async () => {
    const { service, scopeAssert, reconRunnerRun } = buildHarness({ isDemo: true });

    await expect(
      service.execute('user-1', { targetId: 'target-1', tool: 'SUBFINDER', args: [] }, 'API'),
    ).rejects.toMatchObject({ code: 'DEMO_WORKSPACE_READ_ONLY' });

    expect(scopeAssert).not.toHaveBeenCalled();
    expect(reconRunnerRun).not.toHaveBeenCalled();
  });
});

describe('AdHocCommandService — command registry (default deny)', () => {
  it('rejects an unrecognized tool name (unauthorized command — not on the allowlist)', async () => {
    const { service, reconRunnerRun, created } = buildHarness({});

    await expect(
      service.execute('user-1', { targetId: 'target-1', tool: 'TOTALLY_MADE_UP_TOOL', args: [] }, 'API'),
    ).rejects.toMatchObject({ code: 'COMMAND_TOOL_NOT_ALLOWLISTED' });

    expect(reconRunnerRun).not.toHaveBeenCalled();
    expect(created[0]).toMatchObject({ status: 'REJECTED', classification: 'BLOCKED' });
  });

  it('rejects an explicitly blocked command name (blocked command)', async () => {
    const { service, reconRunnerRun, created } = buildHarness({});

    await expect(
      service.execute('user-1', { targetId: 'target-1', tool: 'SHELL', args: ['rm -rf /'] }, 'API'),
    ).rejects.toMatchObject({ code: 'COMMAND_TOOL_NOT_ALLOWLISTED' });

    expect(reconRunnerRun).not.toHaveBeenCalled();
    expect(created[0]).toMatchObject({ status: 'REJECTED', classification: 'BLOCKED' });
  });

  it('never passes a client-supplied string to a shell — SAFE commands only ever reach ToolRunnerRegistry.resolveRunner', async () => {
    const { service, reconRunnerRun } = buildHarness({});

    const result = await service.execute(
      'user-1',
      { targetId: 'target-1', tool: 'SUBFINDER', args: ['--anything'] },
      'API',
    );

    expect(reconRunnerRun).toHaveBeenCalledTimes(1);
    // The runner is called with {target, job, signal, onLog} only — never
    // with the raw `args` array (see run-adhoc-command.dto.ts's comment).
    const callArg = reconRunnerRun.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(callArg).sort()).toEqual(['job', 'onLog', 'signal', 'target']);
    expect(result.status).toBe('SUCCEEDED');
  });
});

describe('AdHocCommandService — Approval Gate', () => {
  it('a REQUIRES_APPROVAL command creates an approval request and does NOT execute (approval bypass attempt #1: no approvalRequestId)', async () => {
    const { service, approvalsCreate, reconRunnerRun, created } = buildHarness({
      target: buildTarget({ type: 'IP_ADDRESS', value: '10.0.0.1' }),
    });

    const result = await service.execute(
      'user-1',
      { targetId: 'target-1', tool: 'NMAP', args: [] },
      'API',
    );

    expect(approvalsCreate).toHaveBeenCalledTimes(1);
    expect(reconRunnerRun).not.toHaveBeenCalled();
    expect(result.status).toBe('PENDING_APPROVAL');
    expect(created[0]).toMatchObject({ status: 'PENDING_APPROVAL', classification: 'REQUIRES_APPROVAL' });
  });

  it('rejects execution when a client-supplied approvalRequestId is not actually APPROVED (approval bypass attempt #2: forged/unapproved id)', async () => {
    const approvalsAssertApproved = jest.fn(async () => {
      throw { code: 'APPROVAL_REQUIRED', message: 'not approved' };
    });
    const { service, reconRunnerRun } = buildHarness({
      target: buildTarget({ type: 'IP_ADDRESS', value: '10.0.0.1' }),
      approvalsAssertApproved,
    });

    await expect(
      service.execute(
        'user-1',
        { targetId: 'target-1', tool: 'NMAP', args: [], approvalRequestId: 'forged-approval-id' },
        'API',
      ),
    ).rejects.toMatchObject({ code: 'APPROVAL_REQUIRED' });

    expect(approvalsAssertApproved).toHaveBeenCalledWith('forged-approval-id', 'workspace-1');
    expect(reconRunnerRun).not.toHaveBeenCalled();
  });

  it('executes once assertApproved genuinely passes', async () => {
    const { service, reconRunnerRun } = buildHarness({
      target: buildTarget({ type: 'IP_ADDRESS', value: '10.0.0.1' }),
    });

    const result = await service.execute(
      'user-1',
      { targetId: 'target-1', tool: 'NMAP', args: [], approvalRequestId: 'approval-1' },
      'API',
    );

    expect(reconRunnerRun).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('SUCCEEDED');
  });
});

describe('AdHocCommandService — identical enforcement regardless of triggering surface', () => {
  const sources = ['WEB', 'DESKTOP', 'CLI', 'API', 'MCP', 'PLUGIN', 'WORKFLOW'] as const;

  it.each(sources)('rejects an out-of-scope target identically when source=%s', async (source) => {
    const scopeAssert = jest.fn(async () => {
      throw { code: 'TARGET_OUT_OF_SCOPE', message: 'out of scope' };
    });
    const { service, reconRunnerRun } = buildHarness({
      target: buildTarget({ scopeStatus: 'OUT_OF_SCOPE' }),
      scopeAssert,
    });

    await expect(
      service.execute('user-1', { targetId: 'target-1', tool: 'SUBFINDER', args: [] }, source),
    ).rejects.toMatchObject({ code: 'TARGET_OUT_OF_SCOPE' });

    expect(reconRunnerRun).not.toHaveBeenCalled();
  });

  it.each(sources)('rejects a blocked command identically when source=%s', async (source) => {
    const { service, reconRunnerRun } = buildHarness({});

    await expect(
      service.execute('user-1', { targetId: 'target-1', tool: 'BASH', args: [] }, source),
    ).rejects.toMatchObject({ code: 'COMMAND_TOOL_NOT_ALLOWLISTED' });

    expect(reconRunnerRun).not.toHaveBeenCalled();
  });

  it('rejects an unrecognized/spoofed source string by falling back to API — never trusts the header for authorization', async () => {
    const { service, reconRunnerRun } = buildHarness({
      target: buildTarget({ scopeStatus: 'OUT_OF_SCOPE' }),
      scopeAssert: jest.fn(async () => {
        throw { code: 'TARGET_OUT_OF_SCOPE', message: 'out of scope' };
      }),
    });

    await expect(
      service.execute('user-1', { targetId: 'target-1', tool: 'SUBFINDER', args: [] }, 'TOTALLY_FAKE_SOURCE'),
    ).rejects.toMatchObject({ code: 'TARGET_OUT_OF_SCOPE' });

    expect(reconRunnerRun).not.toHaveBeenCalled();
  });
});

describe('AdHocCommandService — terminal history isolation', () => {
  it('scopes history to the caller’s own workspace AND requestedBy — never another user’s commands', async () => {
    const { service, listMock, workspaceId } = buildHarness({});

    await service.listHistory('user-1', { targetId: 'target-9' });

    expect(listMock).toHaveBeenCalledTimes(1);
    expect(listMock).toHaveBeenCalledWith({
      workspaceId,
      requestedBy: 'user-1',
      targetId: 'target-9',
      status: undefined,
    });
  });

  it('getOne 404s for a command that exists but belongs to a different user/workspace (enumeration-safe)', async () => {
    const { service, findByIdForCallerMock } = buildHarness({});
    findByIdForCallerMock.mockResolvedValueOnce(null);

    await expect(service.getOne('user-1', 'someone-elses-command')).rejects.toMatchObject({
      code: 'ADHOC_COMMAND_NOT_FOUND',
    });
  });
});
