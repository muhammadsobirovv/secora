// Module 17 — Automation rules engine (task #487, spec section 32).
//
// Deliberately narrow in scope: a rule reacts to one of a small, fixed
// set of SOC trigger types by either (a) sending a notification directly
// — the one action class considered safe to run unattended — or
// (b) requesting human approval through the existing
// `SecurityApprovalService` (Module 16 #399) before anything else
// happens. There is no third path. "No rule may bypass security
// controls" (spec section 32) means an automation rule is never itself
// a second execution engine — it only ever calls services that already
// existed (`NotificationDispatcherService`, `IncidentsService`,
// `RemediationService`) through the same approval gate a human-triggered
// action would go through.

import type { RemediationPriority } from "./soc-threat-intel.js";

export type AutomationRuleTriggerType =
  | "KEV_MATCH"
  | "INDICATOR_MATCH"
  | "SLA_BREACH"
  | "NEW_INTERNET_FACING_ASSET"
  | "CUSTOM";

export type AutomationRuleStatus = "ENABLED" | "DISABLED";

/// `NOTIFY` is the only action kind that runs without an approval gate.
/// `CREATE_INCIDENT`/`CREATE_REMEDIATION_TASK` always route through
/// `SecurityApprovalService` first — see `AutomationRulesService`'s doc
/// comment for exactly how the approve -> execute handoff works.
export type AutomationRuleActionKind = "NOTIFY" | "CREATE_INCIDENT" | "CREATE_REMEDIATION_TASK";

export interface NotifyActionConfig {
  kind: "NOTIFY";
  userId: string;
  title: string;
  body?: string;
}

export interface CreateIncidentActionConfig {
  kind: "CREATE_INCIDENT";
  projectId: string;
  title: string;
  description: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export interface CreateRemediationTaskActionConfig {
  kind: "CREATE_REMEDIATION_TASK";
  projectId: string;
  notes: string;
  priority?: RemediationPriority;
}

export type AutomationRuleActionConfig =
  | NotifyActionConfig
  | CreateIncidentActionConfig
  | CreateRemediationTaskActionConfig;

/// `triggerConfig` is a flat key-value match against the trigger's
/// runtime context (e.g. `{ minSeverity: "HIGH" }` for `SLA_BREACH`,
/// `{ indicatorType: "IP" }` for `INDICATOR_MATCH`) — deliberately not a
/// full expression language; see `AutomationRulesService.matchesTrigger`.
export interface AutomationRuleDto {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  triggerType: AutomationRuleTriggerType;
  triggerConfig: Record<string, unknown>;
  actionConfig: AutomationRuleActionConfig;
  status: AutomationRuleStatus;
  requiresApproval: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAutomationRuleRequestDto {
  name: string;
  description?: string;
  triggerType: AutomationRuleTriggerType;
  triggerConfig?: Record<string, unknown>;
  actionConfig: AutomationRuleActionConfig;
}

export interface UpdateAutomationRuleRequestDto {
  name?: string;
  description?: string | null;
  triggerConfig?: Record<string, unknown>;
  actionConfig?: AutomationRuleActionConfig;
}

export type AutomationRuleExecutionOutcome = "EXECUTED" | "PENDING_APPROVAL" | "EXECUTION_FAILED" | "SKIPPED_DISABLED";

export interface AutomationRuleExecutionLogDto {
  id: string;
  ruleId: string;
  workspaceId: string;
  triggeredBy: string;
  outcome: AutomationRuleExecutionOutcome;
  detail: Record<string, unknown> | null;
  createdAt: string;
}

/// Response of the decide-and-execute endpoint — distinct from
/// `SecurityApprovalRequestDto` (Module 16) itself so a caller can see,
/// in one response, both the approval decision and (when approved)
/// whether the now-unblocked action actually ran.
export interface DecideAutomationApprovalResponseDto {
  approvalRequestId: string;
  approved: boolean;
  executionOutcome: AutomationRuleExecutionOutcome | null;
  executionDetail: Record<string, unknown> | null;
}
