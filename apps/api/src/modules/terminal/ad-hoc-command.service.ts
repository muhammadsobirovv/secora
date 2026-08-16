import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type { AdHocCommandDto, RunAdHocCommandRequestDto, TerminalCommandSource } from '@pentesthub/shared';
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
import { GlobalSecurityPolicyService } from '../security/global-security-policy.service.js';
import { SecurityApprovalService } from '../security/security-approval.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ToolRunnerRegistry } from '../recon/tool-runners/tool-runner-registry.service.js';
import { ScannerRunnerRegistry } from '../vuln/scanner-runners/scanner-runner-registry.service.js';
import type { ReconTool, VulnScanner } from '../../prisma-types.js';
import {
  ADHOC_COMMANDS_REPOSITORY,
  type AdHocCommandsRepository,
} from './domain/repositories/adhoc-commands.repository.interface.js';
import { resolveTerminalCommandClassification } from './command-registry.js';
import { toAdHocCommandDto } from './mappers/to-adhoc-command-dto.mapper.js';

const MAX_OUTPUT_CHARS = 500_000;
const VALID_SOURCES: TerminalCommandSource[] = ['WEB', 'DESKTOP', 'CLI', 'API', 'MCP', 'PLUGIN', 'WORKFLOW'];

/// Module 16 — Terminal workspace + safe command execution (task #388).
///
/// THIS is the sole execution surface for ad-hoc Terminal commands — no
/// controller, MCP tool, plugin action, workflow step, CLI handler, or
/// Desktop bridge endpoint may execute a tool without going through
/// `execute()` on this service (or the equivalent `CreateReconJobCommand`/
/// `CreateVulnScanJobCommand` CQRS commands, for the batch/async Recon-Job
/// and Vuln-Scan-Job surfaces respectively — the two execution models
/// this module preserves rather than duplicating). Every caller — web
/// terminal, desktop terminal integration, CLI terminal integration —
/// passes through the identical five gates below, in the identical order,
/// regardless of the `source` label attached for audit purposes:
///
///   1. `resolveTargetForCaller` — target ownership resolved from the
///      *authenticated* userId + DB state, never from a client-supplied
///      workspaceId/projectId. A targetId for another workspace's target
///      404s here exactly like it does for Recon/Vuln job creation.
///   2. Demo-workspace guard — identical reasoning to
///      CreateReconJobHandler: a demo workspace can only ever be read-only.
///   3. `resolveTerminalCommandClassification` — THE explicit command
///      registry (command-registry.ts), never a string-matching heuristic.
///      An unrecognized tool name is treated as BLOCKED, not "unknown, try
///      anyway" — default-deny.
///   4. `ScopeEngineService.assertExecutionAllowed` — the same canonical
///      scope gate Recon/Vuln jobs and AI Investigation steps use.
///   5. `GlobalSecurityPolicyService.assertToolAllowed` — workspace-level
///      allow/block-list on top of the fixed platform registry.
///
/// Only after all five pass (and, for REQUIRES_APPROVAL commands, only
/// after `SecurityApprovalService.assertApproved` also passes) does this
/// service call into `ToolRunnerRegistry`/`ScannerRunnerRegistry` — the
/// exact same ToolRunner/ScannerRunner implementations Recon/Vuln jobs
/// use. There is no second execution engine, no raw shell invocation, and
/// no code path that takes a client-supplied string and passes it to a
/// shell.
@Injectable()
export class AdHocCommandService {
  private readonly logger = new Logger(AdHocCommandService.name);

  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROJECTS_REPOSITORY) private readonly projectsRepository: ProjectsRepository,
    @Inject(TARGETS_REPOSITORY) private readonly targetsRepository: TargetsRepository,
    @Inject(ADHOC_COMMANDS_REPOSITORY) private readonly adHocCommandsRepository: AdHocCommandsRepository,
    private readonly scopeEngine: ScopeEngineService,
    private readonly securityPolicy: GlobalSecurityPolicyService,
    private readonly approvals: SecurityApprovalService,
    private readonly auditService: AuditService,
    private readonly toolRunnerRegistry: ToolRunnerRegistry,
    private readonly scannerRunnerRegistry: ScannerRunnerRegistry,
  ) {}

  async execute(
    userId: string,
    dto: RunAdHocCommandRequestDto,
    rawSource: string | undefined,
  ): Promise<AdHocCommandDto> {
    const source = (VALID_SOURCES as string[]).includes(rawSource ?? '')
      ? (rawSource as TerminalCommandSource)
      : 'API';

    // --- Gate 1: ownership, resolved server-side --------------------------
    const { workspaceId, isDemoWorkspace, target } = await resolveTargetForCaller(
      this.workspacesRepository,
      this.projectsRepository,
      this.targetsRepository,
      userId,
      dto.targetId,
    );

    // --- Gate 2: demo workspaces are read-only -----------------------------
    if (isDemoWorkspace) {
      throw new AppException(
        'DEMO_WORKSPACE_READ_ONLY',
        'This is a demo workspace with sample data only — terminal commands are disabled. Sign up for a free account to run real commands.',
        HttpStatus.FORBIDDEN,
      );
    }

    // --- Gate 3: the explicit command registry — default deny -------------
    const { definition, classification } = resolveTerminalCommandClassification(dto.tool);

    if (classification === 'BLOCKED' || !definition) {
      await this.adHocCommandsRepository.create({
        workspaceId,
        projectId: target.projectId,
        targetId: target.id,
        tool: dto.tool,
        kind: 'RECON_TOOL',
        argsSummary: summarizeArgs(dto.args),
        classification: 'BLOCKED',
        status: 'REJECTED',
        rejectionReason: `"${dto.tool}" is not on the Terminal command allowlist.`,
        requestedBy: userId,
        source,
        researchSessionId: dto.researchSessionId ?? null,
      });
      await this.recordAudit(userId, workspaceId, target.id, dto.tool, null, 'BLOCKED', source);
      throw new AppException(
        'COMMAND_TOOL_NOT_ALLOWLISTED',
        `"${dto.tool}" is not an allowed Terminal command.`,
        HttpStatus.FORBIDDEN,
      );
    }

    if (!definition.allowedTargetTypes.includes(target.type)) {
      throw new AppException(
        'COMMAND_TARGET_TYPE_NOT_SUPPORTED',
        `${definition.name} does not support target type ${target.type}.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // --- Gate 4: Scope Engine — the canonical target authorization boundary
    await this.scopeEngine.assertExecutionAllowed({
      userId,
      workspaceId,
      target: {
        id: target.id,
        type: target.type,
        value: target.value,
        scopeStatus: target.scopeStatus,
        projectId: target.projectId,
      },
      operationType: 'AD_HOC_COMMAND',
    });

    // --- Gate 5: workspace-level Global Security Policy --------------------
    await this.securityPolicy.assertToolAllowed(workspaceId, definition.tool, target.type);

    // --- Gate 6: Approval Gate for REQUIRES_APPROVAL commands --------------
    if (classification === 'REQUIRES_APPROVAL') {
      if (!dto.approvalRequestId) {
        const approval = await this.approvals.create(workspaceId, userId, {
          operationType: 'DESTRUCTIVE_COMMAND',
          riskLevel: definition.riskLevel === 'CRITICAL' ? 'CRITICAL' : definition.riskLevel === 'HIGH' ? 'HIGH' : 'MEDIUM',
          resourceType: 'TERMINAL_COMMAND',
          resourceId: target.id,
          reason: `Run ${definition.name} against target ${target.value}`,
          payload: { tool: definition.name, targetId: target.id, args: dto.args },
        });
        const pending = await this.adHocCommandsRepository.create({
          workspaceId,
          projectId: target.projectId,
          targetId: target.id,
          tool: definition.name,
          kind: definition.kind,
          argsSummary: summarizeArgs(dto.args),
          classification,
          status: 'PENDING_APPROVAL',
          approvalRequestId: approval.id,
          requestedBy: userId,
          source,
          researchSessionId: dto.researchSessionId ?? null,
        });
        await this.recordAudit(userId, workspaceId, target.id, definition.name, approval.id, 'PENDING_APPROVAL', source);
        return toAdHocCommandDto(pending);
      }
      // Re-verifies against the DB — never trusts that a client-supplied
      // approvalRequestId is actually APPROVED just because it was sent.
      await this.approvals.assertApproved(dto.approvalRequestId, workspaceId);
    }

    // --- Execute: the canonical ToolRunner/ScannerRunner layer -------------
    const record = await this.adHocCommandsRepository.create({
      workspaceId,
      projectId: target.projectId,
      targetId: target.id,
      tool: definition.name,
      kind: definition.kind,
      argsSummary: summarizeArgs(dto.args),
      classification,
      status: 'RUNNING',
      approvalRequestId: dto.approvalRequestId ?? null,
      requestedBy: userId,
      source,
      researchSessionId: dto.researchSessionId ?? null,
    });

    const startedAt = new Date();
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), definition.timeoutSeconds * 1000);
    const logLines: string[] = [];

    try {
      let exitCode: number | null;
      let stdout: string;
      let timedOut: boolean;

      if (definition.kind === 'RECON_TOOL') {
        const runner = this.toolRunnerRegistry.resolveRunner(definition.tool as ReconTool, {
          id: target.id,
          type: target.type,
          value: target.value,
        });
        const result = await runner.run({
          target: { id: target.id, type: target.type, value: target.value },
          job: { id: record.id, timeoutSeconds: definition.timeoutSeconds },
          signal: controller.signal,
          onLog: (level, message) => logLines.push(`[${level}] ${message}`),
        });
        exitCode = result.exitCode;
        stdout = result.stdout;
        timedOut = result.timedOut;
      } else {
        const runner = this.scannerRunnerRegistry.resolveRunner(definition.tool as VulnScanner, {
          id: target.id,
          type: target.type,
          value: target.value,
        });
        const result = await runner.run({
          target: { id: target.id, type: target.type, value: target.value },
          job: { id: record.id, timeoutSeconds: definition.timeoutSeconds },
          config: null,
          signal: controller.signal,
          onLog: (level, message) => logLines.push(`[${level}] ${message}`),
        });
        exitCode = result.exitCode;
        stdout = result.stdout;
        timedOut = result.timedOut;
      }

      clearTimeout(timeoutHandle);
      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - startedAt.getTime();
      const status = timedOut ? 'TIMED_OUT' : exitCode === 0 ? 'SUCCEEDED' : 'FAILED';

      const updated = await this.adHocCommandsRepository.update(record.id, {
        status,
        exitCode,
        stdout: clampOutput(stdout),
        stderr: clampOutput(logLines.filter((l) => l.startsWith('[WARN]') || l.startsWith('[ERROR]')).join('\n')),
        startedAt,
        finishedAt,
        durationMs,
      });

      await this.recordAudit(userId, workspaceId, target.id, definition.name, dto.approvalRequestId ?? null, status, source);
      return toAdHocCommandDto(updated);
    } catch (error: unknown) {
      clearTimeout(timeoutHandle);
      const finishedAt = new Date();
      const updated = await this.adHocCommandsRepository.update(record.id, {
        status: 'FAILED',
        stderr: clampOutput(String(error instanceof Error ? error.message : error)),
        startedAt,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      });
      await this.recordAudit(userId, workspaceId, target.id, definition.name, dto.approvalRequestId ?? null, 'FAILED', source);
      this.logger.warn(`AdHocCommand ${record.id} (${definition.name}) failed: ${String(error)}`);
      return toAdHocCommandDto(updated);
    }
  }

  /// List of the *caller's own* commands in their *own* workspace —
  /// "Never expose another user's terminal history" (spec) is enforced by
  /// filtering on `requestedBy = userId` at the repository layer, not by a
  /// client-supplied filter.
  async listHistory(userId: string, filter: { targetId?: string; status?: string } = {}): Promise<AdHocCommandDto[]> {
    const workspace = await this.workspacesRepository.findPersonalWorkspaceForUser(userId);
    if (!workspace) {
      throw new AppException('WORKSPACE_NOT_FOUND', 'Workspace not found.', HttpStatus.NOT_FOUND);
    }
    const commands = await this.adHocCommandsRepository.list({
      workspaceId: workspace.id,
      requestedBy: userId,
      targetId: filter.targetId,
      status: filter.status,
    });
    return commands.map(toAdHocCommandDto);
  }

  async getOne(userId: string, id: string): Promise<AdHocCommandDto> {
    const workspace = await this.workspacesRepository.findPersonalWorkspaceForUser(userId);
    if (!workspace) {
      throw new AppException('WORKSPACE_NOT_FOUND', 'Workspace not found.', HttpStatus.NOT_FOUND);
    }
    const command = await this.adHocCommandsRepository.findByIdForCaller(id, workspace.id, userId);
    if (!command) {
      throw new AppException('ADHOC_COMMAND_NOT_FOUND', 'Command not found.', HttpStatus.NOT_FOUND);
    }
    return toAdHocCommandDto(command);
  }

  private async recordAudit(
    userId: string,
    workspaceId: string,
    targetId: string,
    tool: string,
    approvalRequestId: string | null,
    result: string,
    source: TerminalCommandSource,
  ): Promise<void> {
    await this.auditService
      .log({
        userId,
        type: 'TERMINAL_COMMAND_EXECUTED',
        ipAddress: 'internal',
        userAgent: `terminal/${source}`,
        metadata: { workspaceId, targetId, tool, approvalRequestId, result, source },
      })
      .catch((error: unknown) =>
        this.logger.warn(`Failed to write TERMINAL_COMMAND_EXECUTED audit event: ${String(error)}`),
      );
  }
}

function summarizeArgs(args: string[] | undefined): string | null {
  if (!args?.length) return null;
  return args.join(' ').slice(0, 500);
}

function clampOutput(text: string | null | undefined): string | null {
  if (!text) return text ?? null;
  return text.length > MAX_OUTPUT_CHARS ? `${text.slice(0, MAX_OUTPUT_CHARS)}\n… (truncated at ${MAX_OUTPUT_CHARS} chars)` : text;
}
