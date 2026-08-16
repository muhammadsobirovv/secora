import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import type {
  PlaybookCondition,
  PlaybookDryRunResultDto,
  PlaybookExecutionDto,
  PlaybookGraph,
  PlaybookNode,
  StartPlaybookExecutionRequestDto,
} from '@pentesthub/shared';
import { AppException } from '../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  PROJECTS_REPOSITORY,
  type ProjectsRepository,
} from '../projects/domain/repositories/projects.repository.interface.js';
import {
  TARGETS_REPOSITORY,
  type TargetsRepository,
} from '../targets/domain/repositories/targets.repository.interface.js';
import { resolveTargetForCaller } from '../targets/commands/target-lifecycle.commands.js';
import { ScopeEngineService } from '../security/scope-engine.service.js';
import { SecurityApprovalService } from '../security/security-approval.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AdHocCommandService } from '../terminal/ad-hoc-command.service.js';
import { TERMINAL_COMMAND_REGISTRY } from '../terminal/command-registry.js';
import {
  EVIDENCE_REPOSITORY,
  type EvidenceRepository,
} from '../evidence/domain/repositories/evidence.repository.interface.js';
import { CreateBugBountyFindingCommand } from '../bugbounty/commands/bugbounty-finding-lifecycle.commands.js';
import {
  PLAYBOOKS_REPOSITORY,
  type PlaybooksRepository,
} from './domain/repositories/playbooks.repository.interface.js';
import {
  PLAYBOOK_EXECUTIONS_REPOSITORY,
  type PlaybookExecutionsRepository,
} from './domain/repositories/playbook-executions.repository.interface.js';
import { toPlaybookExecutionDto } from './mappers/to-playbook-dto.mapper.js';

/// Module 16 — Playbook execution engine (task #389, spec sections "STEP
/// EXECUTION" and "PLAYBOOK TEST MODE").
///
/// Every step type that touches infrastructure goes through the *existing*
/// canonical services this module already established, never a bespoke
/// second implementation:
///   - RECON / HTTP_PROBE / PORT_SCAN / TECHNOLOGY_DETECTION /
///     VULNERABILITY_SCAN  -> AdHocCommandService.execute() (the same
///     Scope Engine -> Permission Check -> Approval Gate -> ToolRunner ->
///     Job Queue -> Audit Log path Terminal uses for a single tool run).
///   - SCOPE_VALIDATION    -> ScopeEngineService.evaluate() (read-only).
///   - FINDING_CREATION    -> CreateBugBountyFindingCommand (only when the
///     step config supplies a programId — a playbook target is not
///     necessarily linked to a bug-bounty program; when it isn't, this
///     step is a disclosed no-op that records what *would* have been
///     created rather than guessing a program).
///   - EVIDENCE_COLLECTION -> EvidenceRepository.create() with
///     EvidenceType 'LOG'.
///   - APPROVAL            -> SecurityApprovalService.create(), which
///     halts the walk (WAITING_APPROVAL) until a human decides via
///     decideApproval() below.
///
/// AI_ANALYSIS / REPORT_GENERATION / NOTIFICATION / WEBHOOK / EXPORT are
/// **disclosed thin stubs**: each records its planned action in the step's
/// `output` and completes successfully, but does not call an AI provider,
/// render a real report, deliver a notification, or make an HTTP request.
/// This is intentional rather than a hidden gap — building a correct,
/// safe outbound-webhook/notification dispatcher was judged out of scope
/// for this pass and is called out explicitly in the Module 16 final
/// report rather than being silently faked as complete.
@Injectable()
export class PlaybookExecutionService {
  private readonly logger = new Logger(PlaybookExecutionService.name);

  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROJECTS_REPOSITORY) private readonly projectsRepository: ProjectsRepository,
    @Inject(TARGETS_REPOSITORY) private readonly targetsRepository: TargetsRepository,
    @Inject(PLAYBOOKS_REPOSITORY) private readonly playbooksRepository: PlaybooksRepository,
    @Inject(PLAYBOOK_EXECUTIONS_REPOSITORY) private readonly executionsRepository: PlaybookExecutionsRepository,
    @Inject(EVIDENCE_REPOSITORY) private readonly evidenceRepository: EvidenceRepository,
    private readonly scopeEngine: ScopeEngineService,
    private readonly approvals: SecurityApprovalService,
    private readonly auditService: AuditService,
    private readonly adHocCommandService: AdHocCommandService,
    private readonly commandBus: CommandBus,
  ) {}

  async dryRun(userId: string, playbookId: string, dto: StartPlaybookExecutionRequestDto): Promise<PlaybookDryRunResultDto> {
    const { playbook, version, target } = await this.resolveForExecution(userId, playbookId, dto.targetId);
    const graph = version.graph as unknown as PlaybookGraph;

    const scopeResult = await this.scopeEngine.evaluate({
      id: target.id,
      type: target.type,
      value: target.value,
      scopeStatus: target.scopeStatus as never,
      projectId: target.projectId,
    });

    const plannedSteps = graph.nodes.map((node) => {
      const toolName = typeof node.config?.tool === 'string' ? node.config.tool.toUpperCase() : null;
      const definition = toolName ? TERMINAL_COMMAND_REGISTRY[toolName] : undefined;
      return {
        nodeId: node.id,
        type: node.type,
        label: node.label,
        toolsInvolved: definition ? [definition.name] : [],
        requiredPermissions: definition ? definition.requiredPermissions : node.type === 'FINDING_CREATION' ? ['project:write'] : [],
        requiresApproval: node.type === 'APPROVAL' || Boolean(definition?.requiresApproval),
      };
    });

    return {
      playbookId: playbook.id,
      playbookVersionId: version.id,
      targetId: target.id,
      plannedSteps,
      targetScopeStatus: scopeResult.decision,
      estimatedDurationSeconds: plannedSteps.reduce((sum, s) => {
        const def = s.toolsInvolved[0] ? TERMINAL_COMMAND_REGISTRY[s.toolsInvolved[0]] : undefined;
        return sum + (def?.timeoutSeconds ?? (s.type === 'DELAY' ? 10 : 5));
      }, 0),
    };
  }

  async start(userId: string, playbookId: string, dto: StartPlaybookExecutionRequestDto): Promise<PlaybookExecutionDto> {
    const { workspaceId, playbook, version, target } = await this.resolveForExecution(userId, playbookId, dto.targetId);
    const graph = version.graph as unknown as PlaybookGraph;

    const execution = await this.executionsRepository.createExecution({
      workspaceId,
      projectId: target.projectId,
      playbookId: playbook.id,
      playbookVersionId: version.id,
      targetId: target.id,
      isDryRun: false,
      variableValues: dto.variableValues ?? {},
      requestedBy: userId,
    });
    await this.executionsRepository.updateExecution(execution.id, { status: 'RUNNING', startedAt: new Date() });

    const context: Record<string, unknown> = { ...(dto.variableValues ?? {}) };
    const outcome = await this.walkGraph(userId, workspaceId, execution.id, target, graph, context, entryNodeIds(graph));

    const finalStatus = outcome === 'WAITING_APPROVAL' ? 'WAITING_APPROVAL' : outcome === 'FAILED' ? 'FAILED' : 'COMPLETED';
    const updated = await this.executionsRepository.updateExecution(execution.id, {
      status: finalStatus,
      finishedAt: finalStatus === 'WAITING_APPROVAL' ? null : new Date(),
    });
    const steps = await this.executionsRepository.listExecutionSteps(execution.id);
    return toPlaybookExecutionDto(updated, steps);
  }

  /// Resumes a WAITING_APPROVAL execution after `decidePlaybookApproval`
  /// (in the CQRS command layer) has recorded the human decision. Rejected
  /// approvals stop every step reachable from the approval node — this is
  /// the spec's "a rejected approval stops dependent steps" requirement.
  async resumeAfterApproval(
    executionId: string,
    approvedNodeId: string,
    approved: boolean,
  ): Promise<void> {
    const execution = await this.executionsRepository.findExecutionById(executionId);
    if (!execution) return;
    const playbook = await this.playbooksRepository.findById(execution.playbookId);
    const version = await this.playbooksRepository.findVersionById(execution.playbookVersionId);
    if (!playbook || !version) return;
    const graph = version.graph as unknown as PlaybookGraph;
    const workspace = await this.workspacesRepository.findById(execution.workspaceId);
    const target = await this.targetsRepository.findById(execution.targetId);
    if (!workspace || !target) return;

    if (!approved) {
      const descendants = collectDescendants(graph, approvedNodeId);
      for (const nodeId of descendants) {
        const steps = await this.executionsRepository.listExecutionSteps(execution.id);
        const step = steps.find((s) => s.nodeId === nodeId);
        if (step && step.status === 'PENDING') {
          await this.executionsRepository.updateExecutionStep(step.id, { status: 'SKIPPED' });
        }
      }
      await this.executionsRepository.updateExecution(execution.id, {
        status: 'FAILED',
        error: 'A required approval was rejected.',
        finishedAt: new Date(),
      });
      return;
    }

    const context = await this.reconstructContext(execution.id, graph);
    const nextNodeIds = graph.edges.filter((e) => e.from === approvedNodeId).map((e) => e.to);
    const outcome = await this.walkGraph(
      execution.requestedBy,
      execution.workspaceId,
      execution.id,
      target,
      graph,
      context,
      nextNodeIds,
    );
    const finalStatus = outcome === 'WAITING_APPROVAL' ? 'WAITING_APPROVAL' : outcome === 'FAILED' ? 'FAILED' : 'COMPLETED';
    await this.executionsRepository.updateExecution(execution.id, {
      status: finalStatus,
      finishedAt: finalStatus === 'WAITING_APPROVAL' ? null : new Date(),
    });
  }

  // --- internals -----------------------------------------------------------

  private async resolveForExecution(userId: string, playbookId: string, targetId: string) {
    const { workspaceId, isDemoWorkspace, target } = await resolveTargetForCaller(
      this.workspacesRepository,
      this.projectsRepository,
      this.targetsRepository,
      userId,
      targetId,
    );
    if (isDemoWorkspace) {
      throw new AppException(
        'DEMO_WORKSPACE_READ_ONLY',
        'This is a demo workspace with sample data only — playbooks are disabled.',
        HttpStatus.FORBIDDEN,
      );
    }
    // Enumeration-safe: a playbook belonging to another workspace 404s
    // identically to one that doesn't exist at all.
    const playbook = await this.playbooksRepository.findByIdForWorkspace(playbookId, workspaceId);
    if (!playbook) {
      throw new AppException('PLAYBOOK_NOT_FOUND', 'Playbook not found.', HttpStatus.NOT_FOUND);
    }
    if (playbook.status !== 'PUBLISHED' || !playbook.currentVersionId) {
      throw new AppException(
        'PLAYBOOK_NOT_PUBLISHED',
        'Only a published playbook version can be executed or dry-run.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const version = await this.playbooksRepository.findVersionById(playbook.currentVersionId);
    if (!version) {
      throw new AppException('PLAYBOOK_VERSION_NOT_FOUND', 'Playbook version not found.', HttpStatus.NOT_FOUND);
    }
    return { workspaceId, playbook, version, target };
  }

  /// Walks the graph breadth-first from `startNodeIds`, executing each
  /// step through its dispatch handler, and following outgoing edges —
  /// only the matching branch for CONDITION nodes. PARALLEL nodes' branches
  /// are walked **sequentially** in this synchronous engine (a disclosed
  /// simplification of the spec's "parallel branches": correctness over
  /// unproven concurrency within an HTTP request's lifetime). Returns the
  /// terminal outcome: 'COMPLETED' | 'FAILED' | 'WAITING_APPROVAL'.
  private async walkGraph(
    userId: string,
    workspaceId: string,
    executionId: string,
    target: { id: string; type: string; value: string; projectId: string; scopeStatus: string },
    graph: PlaybookGraph,
    context: Record<string, unknown>,
    startNodeIds: string[],
  ): Promise<'COMPLETED' | 'FAILED' | 'WAITING_APPROVAL'> {
    const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
    const visited = new Set<string>();
    const queue = [...startNodeIds];

    while (queue.length > 0) {
      const nodeId = queue.shift();
      if (!nodeId || visited.has(nodeId)) continue;
      visited.add(nodeId);
      const node = nodeById.get(nodeId);
      if (!node) continue;

      const stepRow = await this.executionsRepository.createExecutionStep({
        executionId,
        nodeId: node.id,
        stepType: node.type,
        input: node.config ?? {},
      });
      await this.executionsRepository.updateExecutionStep(stepRow.id, { status: 'RUNNING', startedAt: new Date() });

      if (node.type === 'APPROVAL') {
        const approval = await this.approvals.create(workspaceId, userId, {
          operationType: 'DESTRUCTIVE_COMMAND',
          riskLevel: 'MEDIUM',
          resourceType: 'PLAYBOOK_STEP',
          resourceId: node.id,
          reason: `Playbook approval step "${node.label}"`,
          payload: { executionId, nodeId: node.id },
        });
        await this.executionsRepository.createApproval({
          executionId,
          executionStepId: stepRow.id,
          workspaceId,
          requestedBy: userId,
          securityApprovalRequestId: approval.id,
        });
        await this.executionsRepository.updateExecutionStep(stepRow.id, { status: 'WAITING_APPROVAL', approvalId: approval.id });
        this.recordAudit(userId, workspaceId, target.id, `PLAYBOOK_STEP:${node.type}`, 'WAITING_APPROVAL');
        return 'WAITING_APPROVAL';
      }

      let output: unknown;
      let failed = false;
      try {
        output = await this.dispatchStep(userId, workspaceId, target, node, context);
        context[node.id] = output;
        await this.executionsRepository.updateExecutionStep(stepRow.id, {
          status: 'COMPLETED',
          output: output as never,
          finishedAt: new Date(),
        });
      } catch (error: unknown) {
        failed = true;
        const message = error instanceof Error ? error.message : String(error);
        await this.executionsRepository.updateExecutionStep(stepRow.id, {
          status: 'FAILED',
          error: message,
          finishedAt: new Date(),
        });
        this.recordAudit(userId, workspaceId, target.id, `PLAYBOOK_STEP:${node.type}`, 'FAILED');
      }
      this.recordAudit(userId, workspaceId, target.id, `PLAYBOOK_STEP:${node.type}`, failed ? 'FAILED' : 'COMPLETED');

      if (failed) {
        return 'FAILED';
      }

      const outgoing = graph.edges.filter((e) => e.from === node.id);
      if (node.type === 'CONDITION') {
        const conditionConfig = node.config?.condition as PlaybookCondition | undefined;
        const branch = conditionConfig ? evaluateCondition(conditionConfig, context) : false;
        for (const edge of outgoing) {
          if (edge.branch === (branch ? 'true' : 'false')) queue.push(edge.to);
        }
      } else {
        for (const edge of outgoing) queue.push(edge.to);
      }
    }

    return 'COMPLETED';
  }

  private async dispatchStep(
    userId: string,
    workspaceId: string,
    target: { id: string; type: string; value: string; projectId: string; scopeStatus: string },
    node: PlaybookNode,
    context: Record<string, unknown>,
  ): Promise<unknown> {
    const config = node.config ?? {};

    switch (node.type) {
      case 'TARGET':
        return { targetId: target.id };

      case 'SCOPE_VALIDATION': {
        const result = await this.scopeEngine.evaluate({
          id: target.id,
          type: target.type,
          value: target.value,
          scopeStatus: target.scopeStatus as never,
          projectId: target.projectId,
        });
        if (result.decision !== 'ALLOWED') {
          throw new Error(`Scope validation failed: ${result.reason}`);
        }
        return result;
      }

      case 'RECON':
      case 'HTTP_PROBE':
      case 'PORT_SCAN':
      case 'TECHNOLOGY_DETECTION':
      case 'VULNERABILITY_SCAN': {
        const tool = typeof config.tool === 'string' ? config.tool : null;
        if (!tool) throw new Error(`${node.type} step is missing a "tool" in its config.`);
        const result = await this.adHocCommandService.execute(
          userId,
          { targetId: target.id, tool, args: [] },
          'API',
        );
        if (result.status === 'PENDING_APPROVAL') {
          throw new Error(`${tool} requires manual approval outside this playbook run before it can execute — run it once via Terminal, then re-run the playbook.`);
        }
        return {
          reconCompleted: node.type !== 'VULNERABILITY_SCAN',
          scanCompleted: node.type === 'VULNERABILITY_SCAN',
          assetCount: (result.outputPreview ?? '').split('\n').filter(Boolean).length,
          status: result.status,
          adHocCommandId: result.id,
        };
      }

      case 'AI_ANALYSIS':
        // Disclosed thin stub — see class doc comment.
        return { stub: true, note: 'AI_ANALYSIS is not wired to a live AI provider in this pass.' };

      case 'FINDING_CREATION': {
        const programId = typeof config.programId === 'string' ? config.programId : null;
        if (!programId) {
          return { stub: true, note: 'No programId configured for this step — finding not created.' };
        }
        const dto = await this.commandBus.execute(
          new CreateBugBountyFindingCommand(userId, {
            programId,
            targetId: target.id,
            title: typeof config.title === 'string' ? config.title : 'Untitled finding (playbook)',
            description: typeof config.description === 'string' ? config.description : 'Created by a Playbook execution.',
            severity: (typeof config.severity === 'string' ? config.severity : 'MEDIUM') as never,
          }),
        );
        return { findingId: (dto as { id: string }).id };
      }

      case 'EVIDENCE_COLLECTION': {
        const evidence = await this.evidenceRepository.create({
          projectId: target.projectId,
          targetId: target.id,
          type: 'LOG',
          title: typeof config.title === 'string' ? config.title : `Playbook evidence — ${node.label}`,
          description: typeof config.description === 'string' ? config.description : undefined,
          textContent: JSON.stringify(context, null, 2).slice(0, 20_000),
          createdBy: userId,
        });
        return { evidenceId: evidence.id };
      }

      case 'REPORT_GENERATION':
        return { stub: true, note: 'REPORT_GENERATION is not wired to the Report Builder in this pass.' };

      case 'NOTIFICATION':
        return { stub: true, note: 'NOTIFICATION is not wired to a delivery channel in this pass.', message: config.message ?? null };

      case 'WEBHOOK':
        return { stub: true, note: 'WEBHOOK is not wired to an outbound dispatcher in this pass.', url: config.url ?? null };

      case 'CONDITION':
        return { evaluated: true };

      case 'PARALLEL':
        return { note: 'PARALLEL branches execute sequentially in this engine.' };

      case 'DELAY': {
        const seconds = typeof config.delaySeconds === 'number' ? Math.min(config.delaySeconds, 30) : 0;
        if (seconds > 0) await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
        return { delayedSeconds: seconds };
      }

      case 'EXPORT':
        return { stub: true, note: 'EXPORT is not wired to a file/export pipeline in this pass.' };

      default:
        return { note: `Unhandled step type ${node.type}` };
    }
  }

  private async reconstructContext(executionId: string, graph: PlaybookGraph): Promise<Record<string, unknown>> {
    const steps = await this.executionsRepository.listExecutionSteps(executionId);
    const context: Record<string, unknown> = {};
    for (const step of steps) {
      if (step.status === 'COMPLETED') context[step.nodeId] = step.output;
    }
    void graph;
    return context;
  }

  private recordAudit(userId: string, workspaceId: string, targetId: string, step: string, result: string): void {
    this.auditService
      .log({
        userId,
        type: 'PLAYBOOK_STEP_EXECUTED',
        ipAddress: 'internal',
        userAgent: 'playbook-engine',
        metadata: { workspaceId, targetId, step, result },
      })
      .catch((error: unknown) => this.logger.warn(`Failed to write PLAYBOOK_STEP_EXECUTED audit event: ${String(error)}`));
  }
}

function entryNodeIds(graph: PlaybookGraph): string[] {
  const withIncoming = new Set(graph.edges.map((e) => e.to));
  const entries = graph.nodes.filter((n) => !withIncoming.has(n.id)).map((n) => n.id);
  return entries.length > 0 ? entries : graph.nodes.slice(0, 1).map((n) => n.id);
}

function collectDescendants(graph: PlaybookGraph, fromNodeId: string): Set<string> {
  const result = new Set<string>();
  const queue = graph.edges.filter((e) => e.from === fromNodeId).map((e) => e.to);
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id || result.has(id)) continue;
    result.add(id);
    for (const edge of graph.edges.filter((e) => e.from === id)) queue.push(edge.to);
  }
  return result;
}

function evaluateCondition(condition: PlaybookCondition, context: Record<string, unknown>): boolean {
  const flat = flattenContext(context);
  const actual = flat[condition.field];
  const expected = condition.value;
  switch (condition.operator) {
    case 'EXISTS':
      return actual !== undefined && actual !== null;
    case 'EQ':
      return String(actual) === String(expected);
    case 'NEQ':
      return String(actual) !== String(expected);
    case 'CONTAINS':
      return typeof actual === 'string' && actual.includes(String(expected));
    case 'GT':
      return Number(actual ?? 0) > Number(expected);
    case 'GTE':
      return Number(actual ?? 0) >= Number(expected);
    case 'LT':
      return Number(actual ?? 0) < Number(expected);
    case 'LTE':
      return Number(actual ?? 0) <= Number(expected);
    default:
      return false;
  }
}

/// Simplified, disclosed signal extraction: scans every completed step's
/// output for the small closed set of fields PlaybookCondition can
/// reference (see playbooks.ts), taking the most recently produced value.
/// This is heuristic (e.g. ASSET_COUNT is a line-count of tool stdout, not
/// a true deduplicated asset count) — documented here rather than
/// presented as a precise analytics computation.
function flattenContext(context: Record<string, unknown>): Record<string, string | number | boolean | undefined> {
  const flat: Record<string, string | number | boolean | undefined> = {};
  for (const value of Object.values(context)) {
    if (!value || typeof value !== 'object') continue;
    const v = value as Record<string, unknown>;
    if (typeof v.assetCount === 'number') flat.ASSET_COUNT = v.assetCount;
    if (typeof v.reconCompleted === 'boolean') flat.RECON_COMPLETED = v.reconCompleted;
    if (typeof v.scanCompleted === 'boolean') flat.SCAN_COMPLETED = v.scanCompleted;
    if (typeof v.severity === 'string') flat.FINDING_SEVERITY = v.severity;
    if (typeof v.technology === 'string') flat.TECHNOLOGY = v.technology;
    if (typeof v.port === 'number') flat.PORT = v.port;
    if (typeof v.cveMatchConfidence === 'number') flat.CVE_MATCH_CONFIDENCE = v.cveMatchConfidence;
  }
  return flat;
}
