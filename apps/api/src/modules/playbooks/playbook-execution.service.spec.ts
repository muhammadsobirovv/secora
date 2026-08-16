import { PlaybookExecutionService } from './playbook-execution.service.js';
import type { PlaybookGraph } from '@pentesthub/shared';

/// Module 16 — Playbooks (task #389). Focused regression suite covering
/// the three behaviours the spec calls out explicitly: (1) dry-run never
/// calls the tool-execution layer or mutates anything, (2) a real run
/// dispatches tool-invoking steps through AdHocCommandService — the same
/// canonical path Terminal uses, never a second execution engine, and
/// (3) a rejected approval stops every step reachable from the gated
/// node rather than leaving them silently pending forever.
describe('PlaybookExecutionService', () => {
  const target = {
    id: 'target-1',
    projectId: 'project-1',
    type: 'DOMAIN',
    value: 'example.com',
    scopeStatus: 'IN_SCOPE',
  };

  function buildService(overrides: Partial<Record<string, unknown>> = {}) {
    const workspacesRepository = {
      findPersonalWorkspaceForUser: jest.fn().mockResolvedValue({ id: 'workspace-1' }),
      findById: jest.fn().mockResolvedValue({ id: 'workspace-1' }),
    };
    const projectsRepository = {
      findByIdForWorkspace: jest.fn().mockResolvedValue({ id: 'project-1', workspaceId: 'workspace-1' }),
    };
    const targetsRepository = {
      findById: jest.fn().mockResolvedValue(target),
    };
    const playbooksRepository = {
      findByIdForWorkspace: jest.fn().mockResolvedValue({
        id: 'playbook-1',
        workspaceId: 'workspace-1',
        status: 'PUBLISHED',
        currentVersionId: 'version-1',
      }),
      findById: jest.fn().mockResolvedValue({ id: 'playbook-1', workspaceId: 'workspace-1' }),
      findVersionById: jest.fn(),
    };
    const executionsRepository = {
      createExecution: jest.fn().mockResolvedValue({ id: 'execution-1', workspaceId: 'workspace-1' }),
      updateExecution: jest.fn().mockImplementation((id: string, input: Record<string, unknown>) => ({ id, ...input })),
      createExecutionStep: jest.fn().mockImplementation(() => ({ id: `step-${Math.random()}`, status: 'PENDING' })),
      updateExecutionStep: jest.fn().mockResolvedValue({}),
      findExecutionStepById: jest.fn(),
      listExecutionSteps: jest.fn().mockResolvedValue([]),
      createApproval: jest.fn().mockResolvedValue({ id: 'approval-1' }),
      findExecutionById: jest.fn(),
    };
    const evidenceRepository = { create: jest.fn().mockResolvedValue({ id: 'evidence-1' }) };
    const scopeEngine = {
      evaluate: jest.fn().mockResolvedValue({ decision: 'ALLOWED', reason: 'ok' }),
    };
    const approvals = { create: jest.fn().mockResolvedValue({ id: 'security-approval-1' }) };
    const auditService = { log: jest.fn().mockResolvedValue(undefined) };
    const adHocCommandService = {
      execute: jest.fn().mockResolvedValue({ id: 'cmd-1', status: 'SUCCEEDED', outputPreview: 'a\nb\nc' }),
    };
    const commandBus = { execute: jest.fn() };

    const service = new PlaybookExecutionService(
      workspacesRepository as never,
      projectsRepository as never,
      targetsRepository as never,
      playbooksRepository as never,
      executionsRepository as never,
      evidenceRepository as never,
      scopeEngine as never,
      approvals as never,
      auditService as never,
      adHocCommandService as never,
      commandBus as never,
    );

    return {
      service,
      workspacesRepository,
      projectsRepository,
      targetsRepository,
      playbooksRepository,
      executionsRepository,
      evidenceRepository,
      scopeEngine,
      approvals,
      auditService,
      adHocCommandService,
      commandBus,
      ...overrides,
    };
  }

  const simpleGraph: PlaybookGraph = {
    nodes: [
      { id: 'n1', type: 'TARGET', label: 'Target', config: {} },
      { id: 'n2', type: 'RECON', label: 'Recon', config: { tool: 'SUBFINDER' } },
    ],
    edges: [{ id: 'e1', from: 'n1', to: 'n2' }],
  };

  it('dry-run never calls AdHocCommandService or writes an execution row', async () => {
    const ctx = buildService();
    ctx.playbooksRepository.findVersionById.mockResolvedValue({
      id: 'version-1',
      playbookId: 'playbook-1',
      graph: simpleGraph,
      variables: [],
    });

    const result = await ctx.service.dryRun('user-1', 'playbook-1', { targetId: 'target-1' });

    expect(result.plannedSteps).toHaveLength(2);
    expect(result.plannedSteps[1].toolsInvolved).toEqual(['SUBFINDER']);
    expect(ctx.adHocCommandService.execute).not.toHaveBeenCalled();
    expect(ctx.executionsRepository.createExecution).not.toHaveBeenCalled();
  });

  it('a real run dispatches the RECON step through AdHocCommandService (the canonical Terminal execution path)', async () => {
    const ctx = buildService();
    ctx.playbooksRepository.findVersionById.mockResolvedValue({
      id: 'version-1',
      playbookId: 'playbook-1',
      graph: simpleGraph,
      variables: [],
    });
    ctx.executionsRepository.listExecutionSteps.mockResolvedValue([]);

    await ctx.service.start('user-1', 'playbook-1', { targetId: 'target-1' });

    expect(ctx.adHocCommandService.execute).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ targetId: 'target-1', tool: 'SUBFINDER' }),
      'API',
    );
    expect(ctx.executionsRepository.updateExecution).toHaveBeenCalledWith(
      'execution-1',
      expect.objectContaining({ status: 'COMPLETED' }),
    );
  });

  it('rejecting an approval marks the still-pending descendant step SKIPPED and the execution FAILED', async () => {
    const ctx = buildService();
    const graph: PlaybookGraph = {
      nodes: [
        { id: 'n1', type: 'APPROVAL', label: 'Approval', config: {} },
        { id: 'n2', type: 'DELAY', label: 'Delay', config: { delaySeconds: 1 } },
      ],
      edges: [{ id: 'e1', from: 'n1', to: 'n2' }],
    };
    ctx.executionsRepository.findExecutionById.mockResolvedValue({
      id: 'execution-1',
      workspaceId: 'workspace-1',
      playbookId: 'playbook-1',
      playbookVersionId: 'version-1',
      targetId: 'target-1',
      requestedBy: 'user-1',
    });
    ctx.playbooksRepository.findById.mockResolvedValue({ id: 'playbook-1', workspaceId: 'workspace-1' });
    ctx.playbooksRepository.findVersionById.mockResolvedValue({ id: 'version-1', graph, variables: [] });
    const pendingStep = { id: 'step-n2', nodeId: 'n2', status: 'PENDING' };
    ctx.executionsRepository.listExecutionSteps.mockResolvedValue([pendingStep]);

    await ctx.service.resumeAfterApproval('execution-1', 'n1', false);

    expect(ctx.executionsRepository.updateExecutionStep).toHaveBeenCalledWith('step-n2', { status: 'SKIPPED' });
    expect(ctx.executionsRepository.updateExecution).toHaveBeenCalledWith(
      'execution-1',
      expect.objectContaining({ status: 'FAILED', error: expect.stringContaining('rejected') }),
    );
  });
});
