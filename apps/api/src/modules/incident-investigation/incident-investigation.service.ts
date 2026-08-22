import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type {
  IncidentInvestigationPlanStepDto,
  IncidentInvestigationSessionDto,
  IncidentInvestigationStatus,
  IncidentInvestigationStepDto,
  IncidentInvestigationStepKind,
  IncidentInvestigationStepStatus,
  StartIncidentInvestigationRequestDto,
} from '@pentesthub/shared';
import { AppException } from '../../common/exceptions/app.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { IncidentsService } from '../incidents/incidents.service.js';
import { AiSocAnalystService } from '../ai-soc-analyst/ai-soc-analyst.service.js';
import { IndicatorsService } from '../threat-intel/indicators.service.js';
import { SecurityApprovalService } from '../security/security-approval.service.js';
import { AiProviderRegistryService } from '../ai/providers/ai-provider-registry.service.js';
import { collectStreamedCompletion } from '../ai/providers/collect-stream.util.js';
import { fenceUntrusted, UNTRUSTED_CONTENT_PROMPT_RULE } from '../../common/utils/ai-prompt-fencing.util.js';

const STEP_KINDS: IncidentInvestigationStepKind[] = [
  'AI_ANALYSIS',
  'THREAT_INTEL_LOOKUP',
  'CORRELATION_REVIEW',
  'EVIDENCE_REVIEW',
  'MANUAL_REVIEW',
];
const MAX_PLAN_STEPS = 5;
const MAX_LOOKUP_ITEMS = 10;

interface SessionRow {
  id: string;
  workspaceId: string;
  incidentId: string;
  goal: string;
  status: IncidentInvestigationStatus;
  plan: unknown;
  approvalRequestId: string | null;
  failureReason: string | null;
  createdBy: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  completedAt: Date | string | null;
}

interface StepRow {
  id: string;
  sessionId: string;
  stepIndex: number;
  kind: string;
  description: string;
  status: IncidentInvestigationStepStatus;
  output: unknown;
  errorMessage: string | null;
  startedAt: Date | string | null;
  finishedAt: Date | string | null;
}

function toSessionDto(row: SessionRow, steps: StepRow[]): IncidentInvestigationSessionDto {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    incidentId: row.incidentId,
    goal: row.goal,
    status: row.status,
    plan: row.plan as IncidentInvestigationPlanStepDto[] | null,
    approvalRequestId: row.approvalRequestId,
    failureReason: row.failureReason,
    createdBy: row.createdBy,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    completedAt: row.completedAt ? new Date(row.completedAt).toISOString() : null,
    steps: steps.sort((a, b) => a.stepIndex - b.stepIndex).map(toStepDto),
  };
}

function toStepDto(row: StepRow): IncidentInvestigationStepDto {
  return {
    id: row.id,
    stepIndex: row.stepIndex,
    kind: row.kind,
    description: row.description,
    status: row.status,
    output: row.output,
    errorMessage: row.errorMessage,
    startedAt: row.startedAt ? new Date(row.startedAt).toISOString() : null,
    finishedAt: row.finishedAt ? new Date(row.finishedAt).toISOString() : null,
  };
}

/// Module 17 — task #472 (AI Investigation Workflow, defensive lifecycle
/// extension of Module 16's `AiInvestigationService`, task #398).
///
/// Deliberately NOT a copy-paste of the offensive investigation service:
/// every step kind here (`AI_ANALYSIS`/`THREAT_INTEL_LOOKUP`/
/// `CORRELATION_REVIEW`/`EVIDENCE_REVIEW`/`MANUAL_REVIEW`) is a read-only
/// query against already-collected platform data, dispatched through the
/// exact services a human analyst would call directly
/// (`AiSocAnalystService.analyzeIncident`, `IndicatorsService
/// .getForWorkspace`, a direct read of `CorrelationInsight`,
/// `IncidentsService`'s link-count helpers) — never a second execution
/// engine, never a ToolRunner invocation, never a mutation of anything
/// outside this session's own rows and (for AI_ANALYSIS specifically)
/// one append-only Incident timeline row that `AiSocAnalystService`
/// itself already writes.
///
/// Still goes through the full DRAFT -> AWAITING_APPROVAL -> APPROVED ->
/// RUNNING -> COMPLETED/FAILED/CANCELLED lifecycle behind
/// `SecurityApprovalService` (spec: "AI must NOT execute tools without
/// permission/approval") even though every step is read-only — an
/// AI-composed investigation plan against a live incident should never
/// start running without a human being aware of what it intends to look
/// at, even when "looking" carries no side effect risk. This mirrors
/// `AiInvestigationService`'s security posture while diverging on
/// mechanics because the risk profile is categorically different (no
/// scope/tool-allowlist re-check is needed here, since nothing here can
/// ever touch a Target or dispatch a scan).
@Injectable()
export class IncidentInvestigationService {
  private readonly logger = new Logger(IncidentInvestigationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly incidents: IncidentsService,
    private readonly aiSocAnalyst: AiSocAnalystService,
    private readonly indicators: IndicatorsService,
    private readonly securityApproval: SecurityApprovalService,
    private readonly aiProviderRegistry: AiProviderRegistryService,
  ) {}

  private get sessionRepo() {
    return (
      this.prisma as unknown as {
        incidentInvestigationSession: {
          create: (args: unknown) => Promise<SessionRow>;
          update: (args: unknown) => Promise<SessionRow>;
          findUnique: (args: unknown) => Promise<SessionRow | null>;
          findMany: (args: unknown) => Promise<SessionRow[]>;
        };
      }
    ).incidentInvestigationSession;
  }

  private get stepRepo() {
    return (
      this.prisma as unknown as {
        incidentInvestigationStep: {
          createMany: (args: unknown) => Promise<{ count: number }>;
          update: (args: unknown) => Promise<StepRow>;
          findMany: (args: unknown) => Promise<StepRow[]>;
        };
      }
    ).incidentInvestigationStep;
  }

  private async loadSteps(sessionId: string): Promise<StepRow[]> {
    return this.stepRepo.findMany({ where: { sessionId } });
  }

  async listForWorkspace(workspaceId: string): Promise<IncidentInvestigationSessionDto[]> {
    const sessions = await this.sessionRepo.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const out: IncidentInvestigationSessionDto[] = [];
    for (const session of sessions) {
      out.push(toSessionDto(session, await this.loadSteps(session.id)));
    }
    return out;
  }

  async getForWorkspace(id: string, workspaceId: string): Promise<IncidentInvestigationSessionDto> {
    const session = await this.sessionRepo.findUnique({ where: { id } });
    if (!session || session.workspaceId !== workspaceId) {
      throw new AppException('INCIDENT_INVESTIGATION_NOT_FOUND', 'Incident investigation session not found.', HttpStatus.NOT_FOUND);
    }
    return toSessionDto(session, await this.loadSteps(id));
  }

  /// Verifies the incident exists and belongs to this workspace (via
  /// `IncidentsService.getForWorkspace`, never a bespoke ownership check),
  /// composes a plan, persists it, and immediately submits it for
  /// approval — `userId` MUST come from the authenticated request
  /// context.
  async start(userId: string, workspaceId: string, dto: StartIncidentInvestigationRequestDto): Promise<IncidentInvestigationSessionDto> {
    // Throws INCIDENT_NOT_FOUND if the incident doesn't exist or isn't in
    // this workspace — re-uses the exact same ownership check every other
    // Incident-touching surface in this module goes through.
    await this.incidents.getForWorkspace(dto.incidentId, workspaceId);

    const session = await this.sessionRepo.create({
      data: {
        workspaceId,
        incidentId: dto.incidentId,
        goal: dto.goal,
        status: 'DRAFT',
        createdBy: userId,
      },
    });

    const plan = await this.generatePlan(workspaceId, dto.goal);

    await this.stepRepo.createMany({
      data: plan.map((step, index) => ({
        sessionId: session.id,
        stepIndex: index,
        kind: step.kind,
        description: step.description,
        status: 'PENDING' as IncidentInvestigationStepStatus,
      })),
    });

    const approval = await this.securityApproval.create(workspaceId, userId, {
      operationType: 'INCIDENT_INVESTIGATION_WORKFLOW',
      riskLevel: 'LOW',
      resourceType: 'INCIDENT_INVESTIGATION_SESSION',
      resourceId: session.id,
      reason: `AI Investigation Workflow for incident ${dto.incidentId}: "${dto.goal}"`,
      payload: { plan, incidentId: dto.incidentId },
    });

    const updated = await this.sessionRepo.update({
      where: { id: session.id },
      data: { status: 'AWAITING_APPROVAL', plan, approvalRequestId: approval.id },
    });

    return toSessionDto(updated, await this.loadSteps(session.id));
  }

  /// Approve/deny the plan. Approving synchronously runs every step (same
  /// disclosed simplification as `AiInvestigationService.decide` — each
  /// step here is a fast read-only lookup, not a long-running scan, so
  /// synchronous execution is even more appropriate here than in the
  /// offensive case). `deciderId` MUST come from the authenticated
  /// request context.
  async decide(
    id: string,
    workspaceId: string,
    deciderId: string,
    approve: boolean,
    decisionNote?: string,
  ): Promise<IncidentInvestigationSessionDto> {
    const session = await this.sessionRepo.findUnique({ where: { id } });
    if (!session || session.workspaceId !== workspaceId) {
      throw new AppException('INCIDENT_INVESTIGATION_NOT_FOUND', 'Incident investigation session not found.', HttpStatus.NOT_FOUND);
    }
    if (session.status !== 'AWAITING_APPROVAL') {
      throw new AppException(
        'INCIDENT_INVESTIGATION_INVALID_STATE_TRANSITION',
        `Cannot decide on this investigation: it is ${session.status}, not AWAITING_APPROVAL.`,
        HttpStatus.CONFLICT,
      );
    }
    if (!session.approvalRequestId) {
      throw new AppException('INCIDENT_INVESTIGATION_PLAN_NOT_APPROVED', 'This investigation has no associated approval request.', HttpStatus.CONFLICT);
    }

    // Reuses SecurityApprovalService — the exact same Approval Gate every
    // other high-risk (and, here, deliberately-gated-though-low-risk)
    // operation type in this platform uses. No parallel approval
    // mechanism.
    await this.securityApproval.decide(session.approvalRequestId, workspaceId, deciderId, approve, decisionNote);

    await this.incidents
      .appendApprovalEvent(
        session.incidentId,
        workspaceId,
        deciderId,
        approve
          ? `AI Investigation Workflow plan approved by ${deciderId}.`
          : `AI Investigation Workflow plan denied by ${deciderId}${decisionNote ? `: ${decisionNote}` : '.'}`,
        { sessionId: id, approve, decisionNote: decisionNote ?? null },
      )
      .catch((error: unknown) => this.logger.warn(`Failed to append APPROVAL timeline event for incident ${session.incidentId}: ${String(error)}`));

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

  async cancel(id: string, workspaceId: string): Promise<IncidentInvestigationSessionDto> {
    const session = await this.sessionRepo.findUnique({ where: { id } });
    if (!session || session.workspaceId !== workspaceId) {
      throw new AppException('INCIDENT_INVESTIGATION_NOT_FOUND', 'Incident investigation session not found.', HttpStatus.NOT_FOUND);
    }
    if (!['DRAFT', 'AWAITING_APPROVAL', 'APPROVED', 'PAUSED'].includes(session.status)) {
      throw new AppException(
        'INCIDENT_INVESTIGATION_INVALID_STATE_TRANSITION',
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

  private async executeApprovedSession(session: SessionRow, workspaceId: string): Promise<IncidentInvestigationSessionDto> {
    await this.sessionRepo.update({ where: { id: session.id }, data: { status: 'RUNNING' } });

    const steps = await this.loadSteps(session.id);
    let anySucceeded = false;
    let anyFailed = false;

    for (const step of steps.sort((a, b) => a.stepIndex - b.stepIndex)) {
      await this.stepRepo.update({ where: { id: step.id }, data: { status: 'RUNNING', startedAt: new Date() } });

      try {
        const output = await this.executeStep(session, workspaceId, step);
        await this.stepRepo.update({
          where: { id: step.id },
          data: { status: 'SUCCEEDED', output, finishedAt: new Date() },
        });
        anySucceeded = true;
      } catch (error: unknown) {
        const message = error instanceof AppException ? error.message : String(error);
        this.logger.warn(`Incident Investigation ${session.id} step ${step.stepIndex} (${step.kind}) failed: ${message}`);
        await this.stepRepo.update({
          where: { id: step.id },
          data: { status: 'FAILED', errorMessage: message, finishedAt: new Date() },
        });
        anyFailed = true;
      }
    }

    const finalStatus: IncidentInvestigationStatus = anySucceeded ? 'COMPLETED' : 'FAILED';
    const updated = await this.sessionRepo.update({
      where: { id: session.id },
      data: {
        status: finalStatus,
        completedAt: new Date(),
        failureReason: finalStatus === 'FAILED' ? 'All steps failed — see individual step errorMessage fields.' : null,
      },
    });

    return toSessionDto(updated, await this.loadSteps(session.id));
  }

  /// Every branch here is read-only. `AI_ANALYSIS` delegates to the
  /// already-existing `AiSocAnalystService.analyzeIncident` — this method
  /// never generates a second, competing AI analysis of its own; it is
  /// purely a scheduling wrapper that lets an investigation plan include
  /// "run the AI SOC analysis" as one step among several read-only checks.
  private async executeStep(session: SessionRow, workspaceId: string, step: StepRow): Promise<Record<string, unknown>> {
    switch (step.kind as IncidentInvestigationStepKind) {
      case 'AI_ANALYSIS': {
        const analysis = await this.aiSocAnalyst.analyzeIncident(workspaceId, session.createdBy, session.incidentId);
        return {
          confidenceLevel: analysis.confidenceLevel,
          recommendedSeverity: analysis.recommendedSeverity,
          timelineEventId: analysis.timelineEventId,
          evidenceCount: analysis.evidence.length,
        };
      }
      case 'THREAT_INTEL_LOOKUP': {
        const indicatorIds = (await this.incidents.listLinkedIndicatorIds(session.incidentId, workspaceId)).slice(0, MAX_LOOKUP_ITEMS);
        const indicators = await Promise.all(
          indicatorIds.map((indicatorId) => this.indicators.getForWorkspace(indicatorId, workspaceId).catch(() => null)),
        );
        const found = indicators.filter((i): i is NonNullable<typeof i> => i !== null);
        return {
          linkedIndicatorCount: indicatorIds.length,
          resolvedIndicators: found.map((i) => ({ id: i.id, type: i.type, value: i.value, confidence: i.confidence })),
        };
      }
      case 'CORRELATION_REVIEW': {
        const incident = await this.incidents.getForWorkspace(session.incidentId, workspaceId);
        // Task #493: same cross-tenant gap task #492 fixed in
        // AiSocAnalystService — `CorrelationInsight` has its own
        // `workspaceId` column; filtering by `projectId` alone would leak
        // a foreign workspace's insight titles into this step's output if
        // an Incident ever referenced a foreign projectId. Defense-in-
        // depth alongside the `IncidentsService.create` ownership check.
        const insights = await (
          this.prisma as unknown as {
            correlationInsight: {
              findMany: (args: unknown) => Promise<{ id: string; kind: string; title: string; severity: string | null }[]>;
            };
          }
        ).correlationInsight.findMany({
          where: { projectId: incident.projectId, workspaceId },
          orderBy: { createdAt: 'desc' },
          take: MAX_LOOKUP_ITEMS,
        });
        return { correlationInsightCount: insights.length, insights: insights.map((i) => ({ id: i.id, kind: i.kind, title: i.title, severity: i.severity })) };
      }
      case 'EVIDENCE_REVIEW': {
        const [findingIds, evidenceIds, indicatorIds] = await Promise.all([
          this.incidents.listLinkedFindingIds(session.incidentId, workspaceId),
          this.incidents.listLinkedEvidenceIds(session.incidentId, workspaceId),
          this.incidents.listLinkedIndicatorIds(session.incidentId, workspaceId),
        ]);
        return {
          linkedFindingCount: findingIds.length,
          linkedEvidenceCount: evidenceIds.length,
          linkedIndicatorCount: indicatorIds.length,
        };
      }
      case 'MANUAL_REVIEW':
      default:
        return { note: 'Advisory-only step — no automated lookup performed. Review manually.' };
    }
  }

  /// Tries the workspace's configured AI provider first; falls back to a
  /// deterministic, always-available plan on ANY failure (no provider
  /// configured, network error, malformed JSON) — Community Edition never
  /// depends on this succeeding. Every AI-proposed step `kind` is
  /// re-validated against `STEP_KINDS` before being trusted; anything
  /// outside the allowlist is downgraded to `MANUAL_REVIEW` rather than
  /// silently dropped or blindly passed through.
  private async generatePlan(workspaceId: string, goal: string): Promise<IncidentInvestigationPlanStepDto[]> {
    try {
      const aiPlan = await this.generatePlanViaAi(workspaceId, goal);
      if (aiPlan.length > 0) return aiPlan;
    } catch (error: unknown) {
      this.logger.warn(`AI investigation plan generation failed, falling back to deterministic plan: ${String(error)}`);
    }
    return this.buildDeterministicPlan();
  }

  private async generatePlanViaAi(workspaceId: string, goal: string): Promise<IncidentInvestigationPlanStepDto[]> {
    const { provider, credential } = await this.aiProviderRegistry.resolveProvider(workspaceId);

    const systemPrompt = [
      'You are a defensive Security Operations Center investigation planning assistant.',
      'Given an investigation goal for an existing incident, propose a short, read-only investigation plan.',
      `Respond with ONLY a JSON array (no markdown, no prose) of at most ${MAX_PLAN_STEPS} steps, each shaped exactly as:`,
      '{"kind":"AI_ANALYSIS"|"THREAT_INTEL_LOOKUP"|"CORRELATION_REVIEW"|"EVIDENCE_REVIEW"|"MANUAL_REVIEW","description":"short human-readable description"}',
      'Every step kind you propose must be one of the five listed above — do not invent new kinds. Every step is read-only: none of them execute any tool or mutate any external system.',
      // Task #493: `goal` is free text from `StartIncidentInvestigationRequestDto`
      // — same-workspace-authenticated-user text, not cross-tenant data, but
      // still unconstrained free text interpolated straight into the prompt.
      // Fenced and rule-explained for consistency with every other AI-prompt
      // builder in this module, not because a same-tenant caller attacking
      // their own investigation plan is a meaningful threat on its own.
      UNTRUSTED_CONTENT_PROMPT_RULE,
    ].join('\n');

    const raw = await collectStreamedCompletion(
      provider,
      {
        model: provider.getDefaultModel(credential),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: fenceUntrusted(goal) },
        ],
        maxTokens: 500,
        temperature: 0.2,
      },
      credential,
    );

    const parsed = this.parsePlanJson(raw);

    return parsed.slice(0, MAX_PLAN_STEPS).map((step, index) => ({
      stepIndex: index,
      kind: STEP_KINDS.includes(step.kind as IncidentInvestigationStepKind) ? (step.kind as IncidentInvestigationStepKind) : 'MANUAL_REVIEW',
      description: typeof step.description === 'string' ? step.description.slice(0, 500) : 'AI-proposed step',
    }));
  }

  private parsePlanJson(raw: string): Array<Record<string, unknown>> {
    const stripped = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const parsed: unknown = JSON.parse(stripped);
    if (!Array.isArray(parsed)) throw new Error('AI plan response was not a JSON array');
    return parsed.filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null);
  }

  private buildDeterministicPlan(): IncidentInvestigationPlanStepDto[] {
    return [
      { stepIndex: 0, kind: 'EVIDENCE_REVIEW', description: 'Review what evidence, findings, and indicators are already linked to this incident.' },
      { stepIndex: 1, kind: 'THREAT_INTEL_LOOKUP', description: 'Look up details for every threat indicator linked to this incident.' },
      { stepIndex: 2, kind: 'CORRELATION_REVIEW', description: "Review recent correlation insights for this incident's project." },
      { stepIndex: 3, kind: 'AI_ANALYSIS', description: 'Generate an evidence-grounded AI SOC analysis summarizing findings so far.' },
    ];
  }
}
