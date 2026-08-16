import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import type {
  AiInvestigationPlanStepDto,
  AiInvestigationSessionDto,
  AiInvestigationStatus,
  AiInvestigationStepDto,
  AiInvestigationStepStatus,
  ReconJobDto,
  ReconTool,
  StartAiInvestigationRequestDto,
  TargetType,
  VulnScanJobDto,
  VulnScanner,
} from '@pentesthub/shared';
import {
  TOOL_TARGET_TYPE_COMPATIBILITY,
  SCANNER_TARGET_TYPE_COMPATIBILITY,
} from '@pentesthub/shared';
import { AppException } from '../../common/exceptions/app.exception.js';
import { AuditService } from '../audit/audit.service.js';
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
import { GlobalSecurityPolicyService } from '../security/global-security-policy.service.js';
import { AiProviderRegistryService } from '../ai/providers/ai-provider-registry.service.js';
import { collectStreamedCompletion } from '../ai/providers/collect-stream.util.js';
import { CreateReconJobCommand } from '../recon/commands/create-recon-job.command.js';
import { CreateVulnScanJobCommand } from '../vuln/commands/create-vuln-scan-job.command.js';
import { FindingCorrelationService } from '../intelligence/finding-correlation.service.js';
import { VulnerabilityMatchingService } from '../intelligence/vulnerability-matching.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

const VALID_RECON_TOOLS = Object.keys(TOOL_TARGET_TYPE_COMPATIBILITY) as ReconTool[];
const VALID_VULN_SCANNERS = Object.keys(SCANNER_TARGET_TYPE_COMPATIBILITY) as VulnScanner[];
const PREFERRED_RECON_TOOLS: ReconTool[] = [
  'HTTPX', 'NAABU', 'NMAP', 'SUBFINDER', 'ASSETFINDER', 'DNSX', 'WHATWEB', 'KATANA', 'GOWITNESS', 'AMASS', 'GAU', 'WAYBACKURLS', 'WHOIS', 'ASN',
];
const PREFERRED_SCANNERS: VulnScanner[] = ['NUCLEI', 'NIKTO', 'FFUF', 'DIRSEARCH', 'FEROXBUSTER'];

type PlanStepKind = 'RECON_JOB' | 'VULN_SCAN_JOB' | 'CORRELATION' | 'MANUAL_REVIEW';
const PLAN_STEP_KINDS: PlanStepKind[] = ['RECON_JOB', 'VULN_SCAN_JOB', 'CORRELATION', 'MANUAL_REVIEW'];
const RISK_LEVELS: Array<AiInvestigationPlanStepDto['riskLevel']> = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const MAX_PLAN_STEPS = 6;

interface AiInvestigationSessionRow {
  id: string;
  workspaceId: string;
  projectId: string;
  targetId: string;
  researchSessionId: string | null;
  goal: string;
  status: AiInvestigationStatus;
  plan: unknown;
  approvalRequestId: string | null;
  failureReason: string | null;
  createdBy: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  completedAt: Date | string | null;
}

interface AiInvestigationStepRow {
  id: string;
  sessionId: string;
  stepIndex: number;
  kind: string;
  description: string;
  toolName: string | null;
  status: AiInvestigationStepStatus;
  approvalRequestId: string | null;
  input: unknown;
  output: unknown;
  errorMessage: string | null;
  startedAt: Date | string | null;
  finishedAt: Date | string | null;
}

function toSessionDto(row: AiInvestigationSessionRow, steps: AiInvestigationStepRow[]): AiInvestigationSessionDto {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    targetId: row.targetId,
    researchSessionId: row.researchSessionId,
    goal: row.goal,
    status: row.status,
    plan: row.plan as AiInvestigationPlanStepDto[] | null,
    approvalRequestId: row.approvalRequestId,
    failureReason: row.failureReason,
    createdBy: row.createdBy,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    completedAt: row.completedAt ? new Date(row.completedAt).toISOString() : null,
    steps: steps.sort((a, b) => a.stepIndex - b.stepIndex).map(toStepDto),
  };
}

function toStepDto(row: AiInvestigationStepRow): AiInvestigationStepDto {
  return {
    id: row.id,
    stepIndex: row.stepIndex,
    kind: row.kind,
    description: row.description,
    toolName: row.toolName,
    status: row.status,
    approvalRequestId: row.approvalRequestId,
    output: row.output,
    errorMessage: row.errorMessage,
    startedAt: row.startedAt ? new Date(row.startedAt).toISOString() : null,
    finishedAt: row.finishedAt ? new Date(row.finishedAt).toISOString() : null,
  };
}

/// Module 16 — AI Investigation Mode (task #398). The single most
/// security-critical service this module introduces. Lifecycle: DRAFT ->
/// AWAITING_APPROVAL -> APPROVED -> RUNNING -> COMPLETED/FAILED, or
/// CANCELLED at any point before RUNNING. See schema.prisma's
/// `AiInvestigationStatus` doc comment for why APPROVED is a distinct
/// state from RUNNING.
///
/// THE central security property this class must uphold, per this turn's
/// explicit instruction: an AI-authored `plan` (stored as inert,
/// human-readable JSON) is NEVER used to construct a privileged operation.
/// Every field a security decision depends on — workspaceId, projectId,
/// targetId, the caller's identity, scope, approval status, tool
/// permission — is always re-derived from the authenticated caller
/// (`userId`, passed in by the controller from `@CurrentUser()`, never
/// from request body) and from database state, never parsed out of the
/// AI's own output. Concretely:
///   - `start()` resolves workspaceId/target via `resolveTargetForCaller`
///     (the same enumeration-safe helper CreateReconJobCommand/
///     CreateVulnScanJobCommand use) — the AI never supplies these.
///   - The AI's plan JSON may only populate `kind`/`description`/
///     `toolName`/`riskLevel` on each step; even `toolName` is validated
///     against a fixed allowlist (`VALID_RECON_TOOLS`/`VALID_VULN_
///     SCANNERS`) and target-type compatibility before being trusted at
///     all, and is downgraded to a no-op MANUAL_REVIEW step otherwise.
///   - `executeApprovedSession()` dispatches `CreateReconJobCommand`/
///     `CreateVulnScanJobCommand` with `session.createdBy` (the DB row's
///     immutable creator, resolved once at start() time from the
///     authenticated caller) and `session.targetId` (same) — never
///     anything read back out of the plan/step JSON. Those commands
///     themselves call `ScopeEngineService.assertExecutionAllowed()`
///     internally (Module 16 task #370), so scope is re-checked at
///     execution time even if it changed since the plan was approved.
///   - Approval is enforced via `SecurityApprovalService` — the exact
///     same gate every other high-risk operation type uses, not a
///     parallel/bespoke check.
///
/// Execution is synchronous within `decide()` (approving immediately
/// dispatches every step) rather than a separate background worker —
/// disclosed simplification, not a fabricated "it's async" claim; each
/// dispatched Recon/Vuln job itself still runs asynchronously through the
/// existing job-queue/poller infrastructure exactly as it would for a
/// human-initiated scan (see Module 16 final report's "Remaining
/// technical debt" section for the case for a future async step-runner).
@Injectable()
export class AiInvestigationService {
  private readonly logger = new Logger(AiInvestigationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(PROJECTS_REPOSITORY)
    private readonly projectsRepository: ProjectsRepository,
    @Inject(TARGETS_REPOSITORY)
    private readonly targetsRepository: TargetsRepository,
    private readonly scopeEngine: ScopeEngineService,
    private readonly securityApproval: SecurityApprovalService,
    private readonly globalSecurityPolicy: GlobalSecurityPolicyService,
    private readonly aiProviderRegistry: AiProviderRegistryService,
    private readonly commandBus: CommandBus,
    private readonly findingCorrelation: FindingCorrelationService,
    private readonly vulnerabilityMatching: VulnerabilityMatchingService,
    private readonly auditService: AuditService,
  ) {}

  private get sessionRepo() {
    return (
      this.prisma as unknown as {
        aiInvestigationSession: {
          create: (args: unknown) => Promise<AiInvestigationSessionRow>;
          update: (args: unknown) => Promise<AiInvestigationSessionRow>;
          findUnique: (args: unknown) => Promise<AiInvestigationSessionRow | null>;
          findMany: (args: unknown) => Promise<AiInvestigationSessionRow[]>;
        };
      }
    ).aiInvestigationSession;
  }

  private get stepRepo() {
    return (
      this.prisma as unknown as {
        aiInvestigationStep: {
          createMany: (args: unknown) => Promise<{ count: number }>;
          update: (args: unknown) => Promise<AiInvestigationStepRow>;
          findMany: (args: unknown) => Promise<AiInvestigationStepRow[]>;
        };
      }
    ).aiInvestigationStep;
  }

  private async loadSteps(sessionId: string): Promise<AiInvestigationStepRow[]> {
    return this.stepRepo.findMany({ where: { sessionId } });
  }

  async listForWorkspace(workspaceId: string): Promise<AiInvestigationSessionDto[]> {
    const sessions = await this.sessionRepo.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const out: AiInvestigationSessionDto[] = [];
    for (const session of sessions) {
      out.push(toSessionDto(session, await this.loadSteps(session.id)));
    }
    return out;
  }

  async getForWorkspace(id: string, workspaceId: string): Promise<AiInvestigationSessionDto> {
    const session = await this.sessionRepo.findUnique({ where: { id } });
    if (!session || session.workspaceId !== workspaceId) {
      throw new AppException('AI_INVESTIGATION_NOT_FOUND', 'AI investigation session not found.', HttpStatus.NOT_FOUND);
    }
    return toSessionDto(session, await this.loadSteps(id));
  }

  /// User selects target/project -> Scope validation -> AI creates plan ->
  /// (persisted, immediately submitted for approval). `userId` MUST come
  /// from the authenticated request context — see class doc comment.
  async start(userId: string, dto: StartAiInvestigationRequestDto): Promise<AiInvestigationSessionDto> {
    const { workspaceId, isDemoWorkspace, target } = await resolveTargetForCaller(
      this.workspacesRepository,
      this.projectsRepository,
      this.targetsRepository,
      userId,
      dto.targetId,
    );

    if (isDemoWorkspace) {
      throw new AppException(
        'DEMO_WORKSPACE_READ_ONLY',
        'This is a demo workspace with sample data only — AI Investigation Mode is disabled. Sign up for a free account to run real investigations.',
        HttpStatus.FORBIDDEN,
      );
    }

    // Scope validation happens before a plan is even generated — an
    // investigation against an out-of-scope/pending-review target is
    // refused immediately, not deferred to execution time.
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
      operationType: 'AI_INVESTIGATION_PLAN',
    });

    const session = await this.sessionRepo.create({
      data: {
        workspaceId,
        projectId: target.projectId,
        targetId: target.id,
        researchSessionId: dto.researchSessionId ?? null,
        goal: dto.goal,
        status: 'DRAFT',
        createdBy: userId,
      },
    });

    const plan = await this.generatePlan(workspaceId, dto.goal, target.type as TargetType);

    await this.stepRepo.createMany({
      data: plan.map((step, index) => ({
        sessionId: session.id,
        stepIndex: index,
        kind: step.kind,
        description: step.description,
        toolName: step.toolName,
        status: 'PENDING' as AiInvestigationStepStatus,
        input: { riskLevel: step.riskLevel },
      })),
    });

    const highestRisk = plan.reduce<AiInvestigationPlanStepDto['riskLevel']>((acc, step) => {
      const order = RISK_LEVELS.indexOf(step.riskLevel);
      return order > RISK_LEVELS.indexOf(acc) ? step.riskLevel : acc;
    }, 'LOW');

    const approval = await this.securityApproval.create(workspaceId, userId, {
      operationType: 'AI_INVESTIGATION_PLAN',
      riskLevel: highestRisk,
      resourceType: 'AI_INVESTIGATION_SESSION',
      resourceId: session.id,
      reason: `AI Investigation: "${dto.goal}"`,
      payload: { plan },
    });

    const updated = await this.sessionRepo.update({
      where: { id: session.id },
      data: { status: 'AWAITING_APPROVAL', plan, approvalRequestId: approval.id },
    });

    await this.auditService
      .log({
        userId,
        type: 'AI_INVESTIGATION_STARTED',
        ipAddress: 'internal',
        userAgent: 'ai-investigation/start',
        metadata: { workspaceId, sessionId: session.id, targetId: target.id, stepCount: plan.length },
      })
      .catch((error: unknown) => this.logger.warn(`Failed to write AI_INVESTIGATION_STARTED audit event: ${String(error)}`));

    return toSessionDto(updated, await this.loadSteps(session.id));
  }

  /// Approve/deny the plan. Approving synchronously runs every step — see
  /// class doc comment on why this is synchronous rather than a
  /// background worker. `deciderId` MUST come from the authenticated
  /// request context.
  async decide(
    id: string,
    workspaceId: string,
    deciderId: string,
    approve: boolean,
    decisionNote?: string,
  ): Promise<AiInvestigationSessionDto> {
    const session = await this.sessionRepo.findUnique({ where: { id } });
    if (!session || session.workspaceId !== workspaceId) {
      throw new AppException('AI_INVESTIGATION_NOT_FOUND', 'AI investigation session not found.', HttpStatus.NOT_FOUND);
    }
    if (session.status !== 'AWAITING_APPROVAL') {
      throw new AppException(
        'AI_INVESTIGATION_INVALID_STATE_TRANSITION',
        `Cannot decide on this investigation: it is ${session.status}, not AWAITING_APPROVAL.`,
        HttpStatus.CONFLICT,
      );
    }
    if (!session.approvalRequestId) {
      throw new AppException('AI_INVESTIGATION_PLAN_NOT_APPROVED', 'This investigation has no associated approval request.', HttpStatus.CONFLICT);
    }

    // Reuses SecurityApprovalService — the exact same Approval Gate every
    // other high-risk operation type in this module uses. No parallel
    // approval mechanism.
    await this.securityApproval.decide(session.approvalRequestId, workspaceId, deciderId, approve, decisionNote);

    if (!approve) {
      const denied = await this.sessionRepo.update({
        where: { id },
        data: { status: 'FAILED', failureReason: `Plan denied by ${deciderId}${decisionNote ? `: ${decisionNote}` : '.'}` },
      });
      return toSessionDto(denied, await this.loadSteps(id));
    }

    await this.sessionRepo.update({ where: { id }, data: { status: 'APPROVED' } });

    return this.executeApprovedSession(session, workspaceId);
  }

  async cancel(id: string, workspaceId: string): Promise<AiInvestigationSessionDto> {
    const session = await this.sessionRepo.findUnique({ where: { id } });
    if (!session || session.workspaceId !== workspaceId) {
      throw new AppException('AI_INVESTIGATION_NOT_FOUND', 'AI investigation session not found.', HttpStatus.NOT_FOUND);
    }
    if (!['DRAFT', 'AWAITING_APPROVAL', 'APPROVED', 'PAUSED'].includes(session.status)) {
      throw new AppException(
        'AI_INVESTIGATION_INVALID_STATE_TRANSITION',
        `Cannot cancel this investigation: it is already ${session.status}.`,
        HttpStatus.CONFLICT,
      );
    }
    const updated = await this.sessionRepo.update({
      where: { id },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });
    return toSessionDto(updated, await this.loadSteps(id));
  }

  /// Re-verifies scope (via the dispatched commands, which each call
  /// ScopeEngineService internally) and this workspace's Global Security
  /// Policy tool allowlist for every step, then dispatches through the
  /// exact same CommandBus path a human-initiated scan uses — never a
  /// parallel/bypassable execution path (this turn's constraint #3/#4).
  private async executeApprovedSession(
    session: AiInvestigationSessionRow,
    workspaceId: string,
  ): Promise<AiInvestigationSessionDto> {
    await this.sessionRepo.update({ where: { id: session.id }, data: { status: 'RUNNING' } });

    const target = await this.targetsRepository.findById(session.targetId);
    const targetType = (target?.type ?? null) as TargetType | null;

    const steps = await this.loadSteps(session.id);
    let anySucceeded = false;
    let anyFailed = false;

    for (const step of steps.sort((a, b) => a.stepIndex - b.stepIndex)) {
      await this.stepRepo.update({ where: { id: step.id }, data: { status: 'RUNNING', startedAt: new Date() } });

      try {
        const output = await this.executeStep(session, workspaceId, targetType, step);
        await this.stepRepo.update({
          where: { id: step.id },
          data: { status: 'SUCCEEDED', output, finishedAt: new Date() },
        });
        anySucceeded = true;
      } catch (error: unknown) {
        const message = error instanceof AppException ? error.message : String(error);
        this.logger.warn(`AI Investigation ${session.id} step ${step.stepIndex} (${step.kind}) failed: ${message}`);
        await this.stepRepo.update({
          where: { id: step.id },
          data: { status: 'FAILED', errorMessage: message, finishedAt: new Date() },
        });
        anyFailed = true;
      }
    }

    const finalStatus: AiInvestigationStatus = anySucceeded ? 'COMPLETED' : 'FAILED';
    const updated = await this.sessionRepo.update({
      where: { id: session.id },
      data: {
        status: finalStatus,
        completedAt: new Date(),
        failureReason: finalStatus === 'FAILED' ? 'All steps failed — see individual step errorMessage fields.' : null,
      },
    });

    await this.auditService
      .log({
        userId: session.createdBy,
        type: 'AI_INVESTIGATION_EXECUTED',
        ipAddress: 'internal',
        userAgent: 'ai-investigation/execute',
        metadata: { workspaceId, sessionId: session.id, finalStatus, anySucceeded, anyFailed },
      })
      .catch((error: unknown) => this.logger.warn(`Failed to write AI_INVESTIGATION_EXECUTED audit event: ${String(error)}`));

    return toSessionDto(updated, await this.loadSteps(session.id));
  }

  private async executeStep(
    session: AiInvestigationSessionRow,
    workspaceId: string,
    targetType: TargetType | null,
    step: AiInvestigationStepRow,
  ): Promise<Record<string, unknown>> {
    switch (step.kind) {
      case 'RECON_JOB': {
        const tool = this.validateTool(step.toolName, VALID_RECON_TOOLS, targetType, TOOL_TARGET_TYPE_COMPATIBILITY);
        await this.globalSecurityPolicy.assertToolAllowed(workspaceId, tool, targetType ?? 'DOMAIN');
        const job = (await this.commandBus.execute(
          new CreateReconJobCommand(session.createdBy, session.targetId, { tools: [tool] }),
        )) as ReconJobDto;
        return { jobId: job.id, status: job.status, tools: job.tools };
      }
      case 'VULN_SCAN_JOB': {
        const scanner = this.validateTool(step.toolName, VALID_VULN_SCANNERS, targetType, SCANNER_TARGET_TYPE_COMPATIBILITY);
        await this.globalSecurityPolicy.assertToolAllowed(workspaceId, scanner, targetType ?? 'URL');
        const job = (await this.commandBus.execute(
          new CreateVulnScanJobCommand(session.createdBy, session.targetId, { scanners: [scanner] }),
        )) as VulnScanJobDto;
        return { jobId: job.id, status: job.status, scanners: job.scanners };
      }
      case 'CORRELATION': {
        const [matches, insights] = await Promise.all([
          this.vulnerabilityMatching.runForTarget(workspaceId, session.projectId, session.targetId),
          this.findingCorrelation.runForTarget(workspaceId, session.projectId, session.targetId),
        ]);
        return { cveMatchesRecorded: matches, correlationInsightsRecorded: insights };
      }
      case 'MANUAL_REVIEW':
      default:
        return { note: 'Advisory-only step — no automated tool execution. Review manually.' };
    }
  }

  /// Never trusts the AI's `toolName` string outright: it must be a
  /// member of the fixed allowlist AND compatible with the target's type,
  /// exactly like `isToolCompatibleWithTargetType`/
  /// `isScannerCompatibleWithTargetType` already enforce for
  /// human-initiated scans (duplicated here as a plain lookup against the
  /// same shared compatibility map, to fail cleanly with a clear
  /// AppException rather than a raw TypeError on an unrecognized key).
  private validateTool(
    toolName: string | null,
    allowlist: string[],
    targetType: TargetType | null,
    compatibility: Record<string, string[]>,
  ): string {
    if (!toolName || !allowlist.includes(toolName)) {
      throw new AppException(
        'RECON_TOOL_NOT_SUPPORTED_FOR_TARGET_TYPE',
        `"${toolName ?? 'null'}" is not a recognized tool for this step.`,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!targetType || !compatibility[toolName]?.includes(targetType)) {
      throw new AppException(
        'RECON_TOOL_NOT_SUPPORTED_FOR_TARGET_TYPE',
        `${toolName} does not support target type ${targetType ?? 'unknown'}.`,
        HttpStatus.BAD_REQUEST,
      );
    }
    return toolName;
  }

  /// Tries the workspace's configured AI provider first; falls back to a
  /// deterministic, always-available rule-based plan on ANY failure (no
  /// provider configured, network error, malformed JSON) — Community
  /// Edition never depends on this succeeding. Every AI-proposed step is
  /// re-validated against the tool allowlist + target-type compatibility
  /// before being trusted (see class doc comment); anything that doesn't
  /// validate is downgraded to a MANUAL_REVIEW step rather than silently
  /// dropped or blindly passed through.
  private async generatePlan(
    workspaceId: string,
    goal: string,
    targetType: TargetType,
  ): Promise<AiInvestigationPlanStepDto[]> {
    const compatibleReconTools = PREFERRED_RECON_TOOLS.filter((t) => TOOL_TARGET_TYPE_COMPATIBILITY[t]?.includes(targetType));
    const compatibleScanners = PREFERRED_SCANNERS.filter((s) => SCANNER_TARGET_TYPE_COMPATIBILITY[s]?.includes(targetType));

    try {
      const aiPlan = await this.generatePlanViaAi(workspaceId, goal, targetType, compatibleReconTools, compatibleScanners);
      if (aiPlan.length > 0) return aiPlan;
    } catch (error: unknown) {
      this.logger.warn(`AI plan generation failed, falling back to deterministic plan: ${String(error)}`);
    }

    return this.buildDeterministicPlan(compatibleReconTools, compatibleScanners);
  }

  private async generatePlanViaAi(
    workspaceId: string,
    goal: string,
    targetType: TargetType,
    compatibleReconTools: ReconTool[],
    compatibleScanners: VulnScanner[],
  ): Promise<AiInvestigationPlanStepDto[]> {
    const { provider, credential } = await this.aiProviderRegistry.resolveProvider(workspaceId);

    const systemPrompt = [
      'You are a security research planning assistant. Given a goal and a target type, propose a short investigation plan.',
      `Target type: ${targetType}.`,
      `Available recon tools for this target type: ${compatibleReconTools.join(', ') || 'none'}.`,
      `Available vulnerability scanners for this target type: ${compatibleScanners.join(', ') || 'none'}.`,
      `Respond with ONLY a JSON array (no markdown, no prose) of at most ${MAX_PLAN_STEPS} steps, each shaped exactly as:`,
      '{"kind":"RECON_JOB"|"VULN_SCAN_JOB"|"CORRELATION"|"MANUAL_REVIEW","description":"short human-readable description","toolName":"TOOL_NAME_OR_NULL","riskLevel":"LOW"|"MEDIUM"|"HIGH"|"CRITICAL"}',
      'toolName must be one of the available tools listed above (or null for CORRELATION/MANUAL_REVIEW steps). Do not invent tool names.',
    ].join('\n');

    const raw = await collectStreamedCompletion(
      provider,
      {
        model: provider.getDefaultModel(credential),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: goal },
        ],
        maxTokens: 800,
        temperature: 0.2,
      },
      credential,
    );

    const parsed = this.parsePlanJson(raw);
    const allTools = new Set<string>([...compatibleReconTools, ...compatibleScanners]);

    return parsed.slice(0, MAX_PLAN_STEPS).map((step) => {
      const kind = PLAN_STEP_KINDS.includes(step.kind as PlanStepKind) ? (step.kind as PlanStepKind) : 'MANUAL_REVIEW';
      const riskLevel = RISK_LEVELS.includes(step.riskLevel as AiInvestigationPlanStepDto['riskLevel'])
        ? (step.riskLevel as AiInvestigationPlanStepDto['riskLevel'])
        : 'MEDIUM';
      const proposedTool = typeof step.toolName === 'string' ? step.toolName.toUpperCase() : null;
      const toolIsValid = proposedTool !== null && allTools.has(proposedTool);

      return {
        stepIndex: 0, // reassigned by caller
        kind: toolIsValid ? kind : kind === 'RECON_JOB' || kind === 'VULN_SCAN_JOB' ? 'MANUAL_REVIEW' : kind,
        description: typeof step.description === 'string' ? step.description.slice(0, 500) : 'AI-proposed step',
        toolName: toolIsValid ? proposedTool : null,
        riskLevel,
      };
    }).map((step, index) => ({ ...step, stepIndex: index }));
  }

  private parsePlanJson(raw: string): Array<Record<string, unknown>> {
    const stripped = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const parsed: unknown = JSON.parse(stripped);
    if (!Array.isArray(parsed)) throw new Error('AI plan response was not a JSON array');
    return parsed.filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null);
  }

  private buildDeterministicPlan(
    compatibleReconTools: ReconTool[],
    compatibleScanners: VulnScanner[],
  ): AiInvestigationPlanStepDto[] {
    const steps: AiInvestigationPlanStepDto[] = [];

    if (compatibleReconTools.length > 0) {
      steps.push({
        stepIndex: steps.length,
        kind: 'RECON_JOB',
        description: `Run ${compatibleReconTools[0]} reconnaissance against the target to establish baseline attack surface.`,
        toolName: compatibleReconTools[0],
        riskLevel: 'LOW',
      });
    }
    if (compatibleScanners.length > 0) {
      steps.push({
        stepIndex: steps.length,
        kind: 'VULN_SCAN_JOB',
        description: `Run ${compatibleScanners[0]} to check for known vulnerability signatures.`,
        toolName: compatibleScanners[0],
        riskLevel: 'MEDIUM',
      });
    }
    steps.push({
      stepIndex: steps.length,
      kind: 'CORRELATION',
      description: 'Correlate collected findings and match detected technologies against the local CVE cache.',
      toolName: null,
      riskLevel: 'LOW',
    });
    if (steps.length === 1) {
      // Only the correlation step exists — this target type has no
      // compatible recon tool/scanner (e.g. MOBILE_APP, API, CIDR).
      steps.unshift({
        stepIndex: 0,
        kind: 'MANUAL_REVIEW',
        description: 'No automated recon/vulnerability tool is compatible with this target type — manual review recommended.',
        toolName: null,
        riskLevel: 'LOW',
      });
    }
    return steps.map((step, index) => ({ ...step, stepIndex: index }));
  }
}
