import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type {
  AutomationRuleActionConfig,
  AutomationRuleDto,
  AutomationRuleExecutionLogDto,
  AutomationRuleExecutionOutcome,
  AutomationRuleStatus,
  AutomationRuleTriggerType,
  CreateAutomationRuleRequestDto,
  DecideAutomationApprovalResponseDto,
  UpdateAutomationRuleRequestDto,
} from '@pentesthub/shared';
import { AppException } from '../../common/exceptions/app.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SecurityApprovalService } from '../security/security-approval.service.js';
import { NotificationDispatcherService } from '../notifications-channels/services/notification-dispatcher.service.js';
import { IncidentsService } from '../incidents/incidents.service.js';
import { RemediationService } from '../remediation/remediation.service.js';

interface AutomationRuleRow {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  triggerType: string;
  triggerConfig: unknown;
  actionConfig: unknown;
  status: string;
  requiresApproval: boolean;
  createdBy: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface AutomationRuleExecutionLogRow {
  id: string;
  ruleId: string;
  workspaceId: string;
  triggeredBy: string;
  outcome: string;
  detail: unknown;
  createdAt: Date | string;
}

const ACTION_KINDS = ['NOTIFY', 'CREATE_INCIDENT', 'CREATE_REMEDIATION_TASK'] as const;

function toDto(row: AutomationRuleRow): AutomationRuleDto {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    description: row.description,
    triggerType: row.triggerType as AutomationRuleTriggerType,
    triggerConfig: (row.triggerConfig as Record<string, unknown> | null) ?? {},
    actionConfig: row.actionConfig as AutomationRuleActionConfig,
    status: row.status as AutomationRuleStatus,
    requiresApproval: row.requiresApproval,
    createdBy: row.createdBy,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

function toLogDto(row: AutomationRuleExecutionLogRow): AutomationRuleExecutionLogDto {
  return {
    id: row.id,
    ruleId: row.ruleId,
    workspaceId: row.workspaceId,
    triggeredBy: row.triggeredBy,
    outcome: row.outcome as AutomationRuleExecutionOutcome,
    detail: (row.detail as Record<string, unknown> | null) ?? null,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

/// Module 17 — task #487 (Automation rules engine, spec section 32).
///
/// This is deliberately NOT a general-purpose execution engine — that
/// would violate "Never create another execution engine" and "no rule
/// may bypass security controls." A rule can only do one of three
/// things, and exactly two of those three ever touch data:
///
///   - NOTIFY: dispatches a notification through the existing
///     `NotificationDispatcherService` (Module 9/15). Runs immediately,
///     no approval gate — this is the one class of action the schema's
///     own `requiresApproval` doc comment calls out as safe to run
///     unattended.
///   - CREATE_INCIDENT / CREATE_REMEDIATION_TASK: never executed
///     directly by `evaluateTrigger`. Instead a `SecurityApprovalRequest`
///     is raised via the existing `SecurityApprovalService` (Module 16
///     #399) with the intended action stored in its `payload` — the
///     exact same gate a human-triggered high-risk operation goes
///     through. The action only actually runs once a human calls
///     `decideApproval` with `approve: true`, at which point this
///     service calls the *existing* `IncidentsService.create`/
///     `RemediationService.create` (both already fully guarded by their
///     own services — no shortcuts, no duplicate creation logic).
///
/// `matchesTrigger` is intentionally a flat key-value equality/inclusion
/// check against the trigger's runtime context, never an expression
/// language or arbitrary code — keeps a rule's `triggerConfig` fully
/// inspectable and impossible to use to inject logic.
@Injectable()
export class AutomationRulesService {
  private readonly logger = new Logger(AutomationRulesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly securityApproval: SecurityApprovalService,
    private readonly notificationDispatcher: NotificationDispatcherService,
    private readonly incidents: IncidentsService,
    private readonly remediation: RemediationService,
  ) {}

  private get ruleTable() {
    return (
      this.prisma as unknown as {
        automationRule: {
          create: (args: unknown) => Promise<AutomationRuleRow>;
          findMany: (args: unknown) => Promise<AutomationRuleRow[]>;
          findUnique: (args: unknown) => Promise<AutomationRuleRow | null>;
          update: (args: unknown) => Promise<AutomationRuleRow>;
          delete: (args: unknown) => Promise<AutomationRuleRow>;
        };
      }
    ).automationRule;
  }

  private get executionLogTable() {
    return (
      this.prisma as unknown as {
        automationRuleExecutionLog: {
          create: (args: unknown) => Promise<AutomationRuleExecutionLogRow>;
          findMany: (args: unknown) => Promise<AutomationRuleExecutionLogRow[]>;
        };
      }
    ).automationRuleExecutionLog;
  }

  /// `AUTOMATION_RULE_ALERT` is a Module 17-additive value on the
  /// pre-existing `BugBountyNotificationType` enum — same
  /// stale-generated-client concern as a brand-new model, so this one
  /// `bugBountyNotification.create` call (the only place this service
  /// touches that model) goes through the same cast pattern rather than
  /// `this.prisma.bugBountyNotification` directly.
  private get notificationTable() {
    return (
      this.prisma as unknown as {
        bugBountyNotification: {
          create: (args: unknown) => Promise<{ id: string }>;
        };
      }
    ).bugBountyNotification;
  }

  /// The one piece of real validation `class-validator` can't express at
  /// the DTO layer (a discriminated union keyed by `kind`) — see
  /// `CreateAutomationRuleDto`'s own doc comment for why it's here
  /// instead.
  private validateActionConfig(actionConfig: unknown): AutomationRuleActionConfig {
    if (
      !actionConfig ||
      typeof actionConfig !== 'object' ||
      !('kind' in actionConfig) ||
      !ACTION_KINDS.includes((actionConfig as { kind: string }).kind as (typeof ACTION_KINDS)[number])
    ) {
      throw new AppException(
        'AUTOMATION_RULE_ACTION_INVALID',
        `actionConfig.kind must be one of: ${ACTION_KINDS.join(', ')}.`,
        HttpStatus.BAD_REQUEST,
      );
    }
    const cfg = actionConfig as Record<string, unknown>;
    const requireString = (field: string): void => {
      if (typeof cfg[field] !== 'string' || (cfg[field] as string).length === 0) {
        throw new AppException('AUTOMATION_RULE_ACTION_INVALID', `actionConfig.${field} is required for kind ${String(cfg.kind)}.`, HttpStatus.BAD_REQUEST);
      }
    };
    switch (cfg.kind) {
      case 'NOTIFY':
        requireString('userId');
        requireString('title');
        break;
      case 'CREATE_INCIDENT':
        requireString('projectId');
        requireString('title');
        requireString('description');
        if (!['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(cfg.severity as string)) {
          throw new AppException('AUTOMATION_RULE_ACTION_INVALID', 'actionConfig.severity must be LOW|MEDIUM|HIGH|CRITICAL.', HttpStatus.BAD_REQUEST);
        }
        break;
      case 'CREATE_REMEDIATION_TASK':
        requireString('projectId');
        requireString('notes');
        break;
      default:
        break;
    }
    return actionConfig as AutomationRuleActionConfig;
  }

  async create(workspaceId: string, userId: string, dto: CreateAutomationRuleRequestDto): Promise<AutomationRuleDto> {
    const actionConfig = this.validateActionConfig(dto.actionConfig);
    const row = await this.ruleTable.create({
      data: {
        workspaceId,
        name: dto.name,
        description: dto.description ?? null,
        triggerType: dto.triggerType,
        triggerConfig: dto.triggerConfig ?? {},
        actionConfig,
        status: 'ENABLED',
        requiresApproval: actionConfig.kind !== 'NOTIFY',
        createdBy: userId,
      },
    });
    return toDto(row);
  }

  async listForWorkspace(workspaceId: string, filters: { triggerType?: AutomationRuleTriggerType; status?: AutomationRuleStatus }): Promise<AutomationRuleDto[]> {
    const rows = await this.ruleTable.findMany({
      where: {
        workspaceId,
        ...(filters.triggerType ? { triggerType: filters.triggerType } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map(toDto);
  }

  async getForWorkspace(id: string, workspaceId: string): Promise<AutomationRuleDto> {
    return toDto(await this.requireOwnedRow(id, workspaceId));
  }

  private async requireOwnedRow(id: string, workspaceId: string): Promise<AutomationRuleRow> {
    const row = await this.ruleTable.findUnique({ where: { id } });
    if (!row || row.workspaceId !== workspaceId) {
      throw new AppException('AUTOMATION_RULE_NOT_FOUND', 'Automation rule not found.', HttpStatus.NOT_FOUND);
    }
    return row;
  }

  async update(id: string, workspaceId: string, dto: UpdateAutomationRuleRequestDto): Promise<AutomationRuleDto> {
    await this.requireOwnedRow(id, workspaceId);
    const actionConfig = dto.actionConfig !== undefined ? this.validateActionConfig(dto.actionConfig) : undefined;
    const row = await this.ruleTable.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.triggerConfig !== undefined ? { triggerConfig: dto.triggerConfig } : {}),
        ...(actionConfig !== undefined ? { actionConfig, requiresApproval: actionConfig.kind !== 'NOTIFY' } : {}),
      },
    });
    return toDto(row);
  }

  async setStatus(id: string, workspaceId: string, status: AutomationRuleStatus): Promise<AutomationRuleDto> {
    await this.requireOwnedRow(id, workspaceId);
    const row = await this.ruleTable.update({ where: { id }, data: { status } });
    return toDto(row);
  }

  async delete(id: string, workspaceId: string): Promise<void> {
    await this.requireOwnedRow(id, workspaceId);
    await this.ruleTable.delete({ where: { id } });
  }

  async listExecutionLogs(id: string, workspaceId: string): Promise<AutomationRuleExecutionLogDto[]> {
    await this.requireOwnedRow(id, workspaceId);
    const rows = await this.executionLogTable.findMany({ where: { ruleId: id }, orderBy: { createdAt: 'desc' }, take: 200 });
    return rows.map(toLogDto);
  }

  private async logExecution(
    ruleId: string,
    workspaceId: string,
    triggeredBy: string,
    outcome: AutomationRuleExecutionOutcome,
    detail: Record<string, unknown>,
  ): Promise<void> {
    await this.executionLogTable.create({ data: { ruleId, workspaceId, triggeredBy, outcome, detail } });
  }

  /// A flat key-value match: every key present in `triggerConfig` must
  /// equal (or, if the stored value is an array, be included in) the
  /// same key on `context`. An empty/absent `triggerConfig` matches
  /// every event of the rule's `triggerType` — deliberate, since "notify
  /// me on every SLA breach" is a legitimate rule with nothing to
  /// narrow.
  private matchesTrigger(triggerConfig: Record<string, unknown>, context: Record<string, unknown>): boolean {
    for (const [key, expected] of Object.entries(triggerConfig)) {
      const actual = context[key];
      if (Array.isArray(expected)) {
        if (!expected.includes(actual)) return false;
      } else if (actual !== expected) {
        return false;
      }
    }
    return true;
  }

  /// Called by trigger-producing call sites (SLA breach checker,
  /// indicator match, KEV match, new-internet-facing-asset detection) —
  /// never by a client request. `triggeredBy` is a system identifier
  /// (e.g. `'system:sla-breach-checker'`), not a real userId, since
  /// nothing here is a human action; it's recorded as `triggeredBy` on
  /// the execution log purely for audit-trail readability, and as
  /// `requestedBy` on any approval request this raises.
  async evaluateTrigger(workspaceId: string, triggerType: AutomationRuleTriggerType, context: Record<string, unknown>, triggeredBy: string): Promise<void> {
    let rules: AutomationRuleRow[];
    try {
      rules = await this.ruleTable.findMany({ where: { workspaceId, triggerType, status: 'ENABLED' }, take: 100 });
    } catch (error: unknown) {
      this.logger.warn(`evaluateTrigger(${triggerType}) failed to load rules for workspace ${workspaceId}: ${String(error)}`);
      return;
    }
    for (const rule of rules) {
      const triggerConfig = (rule.triggerConfig as Record<string, unknown> | null) ?? {};
      if (!this.matchesTrigger(triggerConfig, context)) continue;
      await this.executeRule(rule, context, triggeredBy).catch((error: unknown) =>
        this.logger.warn(`Automation rule ${rule.id} execution threw unexpectedly: ${String(error)}`),
      );
    }
  }

  private async executeRule(rule: AutomationRuleRow, context: Record<string, unknown>, triggeredBy: string): Promise<void> {
    const actionConfig = rule.actionConfig as AutomationRuleActionConfig;
    try {
      if (actionConfig.kind === 'NOTIFY') {
        const notification = await this.notificationTable.create({
          data: { workspaceId: rule.workspaceId, userId: actionConfig.userId, type: 'AUTOMATION_RULE_ALERT', title: actionConfig.title, body: actionConfig.body ?? null },
        });
        await this.notificationDispatcher.dispatch(notification.id, rule.workspaceId, actionConfig.userId, actionConfig.title, actionConfig.body ?? null);
        await this.logExecution(rule.id, rule.workspaceId, triggeredBy, 'EXECUTED', { notificationId: notification.id });
        return;
      }

      // Every other action kind: request approval, never execute
      // directly — see class doc comment.
      const approval = await this.securityApproval.create(rule.workspaceId, triggeredBy, {
        operationType: 'AUTOMATION_RULE_ACTION',
        riskLevel: 'MEDIUM',
        resourceType: 'AUTOMATION_RULE',
        resourceId: rule.id,
        reason: `Automation rule "${rule.name}" matched trigger ${rule.triggerType} — requesting approval to run its ${actionConfig.kind} action.`,
        payload: { ruleId: rule.id, actionConfig, triggerContext: context },
      });
      await this.logExecution(rule.id, rule.workspaceId, triggeredBy, 'PENDING_APPROVAL', { approvalRequestId: approval.id });
    } catch (error: unknown) {
      await this.logExecution(rule.id, rule.workspaceId, triggeredBy, 'EXECUTION_FAILED', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /// Decides an `AUTOMATION_RULE_ACTION` `SecurityApprovalRequest` via
  /// the existing `SecurityApprovalService.decide` (no duplicate
  /// decision bookkeeping) and, only if approved, executes the exact
  /// action that was stored in the request's `payload` at trigger time —
  /// by calling the already-existing `IncidentsService`/
  /// `RemediationService`, never a bespoke write path. A denied request
  /// executes nothing.
  async decideApproval(
    approvalRequestId: string,
    workspaceId: string,
    deciderId: string,
    approve: boolean,
    decisionNote: string | undefined,
  ): Promise<DecideAutomationApprovalResponseDto> {
    const decided = await this.securityApproval.decide(approvalRequestId, workspaceId, deciderId, approve, decisionNote);
    if (decided.operationType !== 'AUTOMATION_RULE_ACTION') {
      throw new AppException(
        'AUTOMATION_APPROVAL_NOT_AUTOMATION_RULE',
        'This approval request was not raised by an automation rule.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!approve) {
      return { approvalRequestId, approved: false, executionOutcome: null, executionDetail: null };
    }

    const payload = decided.payload as { ruleId: string; actionConfig: AutomationRuleActionConfig } | null | undefined;
    if (!payload || !payload.ruleId || !payload.actionConfig) {
      const detail = { error: 'Approval request has no stored automation action payload.' };
      return { approvalRequestId, approved: true, executionOutcome: 'EXECUTION_FAILED', executionDetail: detail };
    }

    try {
      const detail = await this.executeApprovedAction(workspaceId, deciderId, payload.actionConfig);
      await this.logExecution(payload.ruleId, workspaceId, deciderId, 'EXECUTED', { approvalRequestId, ...detail });
      return { approvalRequestId, approved: true, executionOutcome: 'EXECUTED', executionDetail: detail };
    } catch (error: unknown) {
      const detail = { error: error instanceof Error ? error.message : String(error) };
      await this.logExecution(payload.ruleId, workspaceId, deciderId, 'EXECUTION_FAILED', { approvalRequestId, ...detail });
      return { approvalRequestId, approved: true, executionOutcome: 'EXECUTION_FAILED', executionDetail: detail };
    }
  }

  private async executeApprovedAction(workspaceId: string, userId: string, actionConfig: AutomationRuleActionConfig): Promise<Record<string, unknown>> {
    switch (actionConfig.kind) {
      case 'CREATE_INCIDENT': {
        const incident = await this.incidents.create(workspaceId, userId, {
          projectId: actionConfig.projectId,
          title: actionConfig.title,
          description: actionConfig.description,
          severity: actionConfig.severity,
        });
        return { incidentId: incident.id };
      }
      case 'CREATE_REMEDIATION_TASK': {
        const task = await this.remediation.create(workspaceId, userId, {
          projectId: actionConfig.projectId,
          notes: actionConfig.notes,
          priority: actionConfig.priority,
        });
        return { remediationTaskId: task.id };
      }
      case 'NOTIFY':
        // Defensive only — NOTIFY never creates an approval request in
        // executeRule, so this branch should be unreachable in practice.
        throw new Error('NOTIFY actions execute immediately and never require approval.');
    }
  }
}
