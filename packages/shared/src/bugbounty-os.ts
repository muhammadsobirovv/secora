// Module 9 — Bug Bounty Platform + Collaboration + Reporting Suite.
// Covers the subsystems that are genuinely new rather than extensions of
// existing Module 6 entities (which live in bugbounty.ts instead):
// Collaboration, Automation, multi-channel Notifications, Analytics, and
// the Public API. See docs/adr/0009-bug-bounty-operating-system.md.

import type { WorkspaceMemberRole } from "./workspace.js";

// ---------------------------------------------------------------------------
// Collaboration — invites
// ---------------------------------------------------------------------------

export type WorkspaceInviteStatus = "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";

export interface WorkspaceInviteDto {
  id: string;
  workspaceId: string;
  email: string;
  role: WorkspaceMemberRole;
  status: WorkspaceInviteStatus;
  invitedBy: string;
  expiresAt: string;
  createdAt: string;
}

export interface CreateWorkspaceInviteRequestDto {
  email: string;
  role: WorkspaceMemberRole;
  /// Days until the invite expires — defaults to 7 server-side.
  expiresInDays?: number;
}

export interface AcceptWorkspaceInviteRequestDto {
  token: string;
}

export interface ListWorkspaceInvitesQueryDto {
  status?: WorkspaceInviteStatus;
}

export interface UpdateWorkspaceMemberRoleRequestDto {
  role: WorkspaceMemberRole;
}

// ---------------------------------------------------------------------------
// Collaboration — comments + mentions
// ---------------------------------------------------------------------------

export type CommentEntityType = "PROGRAM" | "FINDING" | "REPORT" | "TARGET" | "NOTE" | "TASK";

export interface CommentDto {
  id: string;
  workspaceId: string;
  entityType: CommentEntityType;
  entityId: string;
  authorId: string;
  bodyMarkdown: string;
  parentCommentId: string | null;
  editedAt: string | null;
  createdAt: string;
  updatedAt: string;
  mentionedUserIds: string[];
}

/// `bodyMarkdown` may contain `@userId` mention tokens (resolved to
/// display names client-side via a mention picker) — the server extracts
/// them into `Mention` rows on create, see collaboration/comments.commands.ts.
export interface CreateCommentRequestDto {
  entityType: CommentEntityType;
  entityId: string;
  bodyMarkdown: string;
  parentCommentId?: string;
}

export interface UpdateCommentRequestDto {
  bodyMarkdown: string;
}

export interface ListCommentsQueryDto {
  entityType: CommentEntityType;
  entityId: string;
}

export interface MentionDto {
  id: string;
  commentId: string;
  mentionedUserId: string;
  createdAt: string;
  readAt: string | null;
}

export interface ListMentionsQueryDto {
  unreadOnly?: boolean;
}

// ---------------------------------------------------------------------------
// Collaboration — assignments + task lists
// ---------------------------------------------------------------------------

export type AssignableEntityType = "PROGRAM" | "FINDING" | "REPORT" | "TARGET" | "TASK";
export type AssignmentStatus = "OPEN" | "IN_PROGRESS" | "DONE";

export interface AssignmentDto {
  id: string;
  workspaceId: string;
  entityType: AssignableEntityType;
  entityId: string;
  assigneeId: string;
  assignedBy: string;
  status: AssignmentStatus;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAssignmentRequestDto {
  entityType: AssignableEntityType;
  entityId: string;
  assigneeId: string;
  dueAt?: string;
}

export interface UpdateAssignmentRequestDto {
  status?: AssignmentStatus;
  dueAt?: string | null;
}

export interface ListAssignmentsQueryDto {
  entityType?: AssignableEntityType;
  entityId?: string;
  assigneeId?: string;
  status?: AssignmentStatus;
}

export interface TaskItemDto {
  id: string;
  workspaceId: string;
  projectId: string | null;
  entityType: string | null;
  entityId: string | null;
  title: string;
  description: string | null;
  done: boolean;
  assigneeId: string | null;
  dueAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskItemRequestDto {
  projectId?: string;
  entityType?: string;
  entityId?: string;
  title: string;
  description?: string;
  assigneeId?: string;
  dueAt?: string;
}

export type UpdateTaskItemRequestDto = Partial<
  Omit<CreateTaskItemRequestDto, "projectId" | "entityType" | "entityId">
> & { done?: boolean };

export interface ListTaskItemsQueryDto {
  projectId?: string;
  assigneeId?: string;
  done?: boolean;
}

// ---------------------------------------------------------------------------
// Collaboration — activity feed (read-through over the existing
// ActivityEvent table, Module 1/2 — no new storage)
// ---------------------------------------------------------------------------

export interface ActivityFeedItemDto {
  id: string;
  actorUserId: string | null;
  verb: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface ListActivityFeedQueryDto {
  projectId?: string;
  entityType?: string;
  entityId?: string;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Automation — scheduled jobs
// ---------------------------------------------------------------------------

export type ScheduledJobKind =
  | "DAILY_RECON"
  | "WEEKLY_NUCLEI"
  | "MONTHLY_ASSET_DISCOVERY"
  | "SCOPE_REFRESH"
  | "SCREENSHOT_UPDATE"
  | "REPORT_BACKUP"
  | "CUSTOM";

export const SCHEDULED_JOB_KINDS: ScheduledJobKind[] = [
  "DAILY_RECON",
  "WEEKLY_NUCLEI",
  "MONTHLY_ASSET_DISCOVERY",
  "SCOPE_REFRESH",
  "SCREENSHOT_UPDATE",
  "REPORT_BACKUP",
  "CUSTOM",
];

/// Presets — the cron expression each named kind defaults to when the
/// caller doesn't supply one explicitly (see
/// automation/scheduled-job-presets.ts).
export const SCHEDULED_JOB_KIND_DEFAULT_CRON: Record<ScheduledJobKind, string> = {
  DAILY_RECON: "0 2 * * *",
  WEEKLY_NUCLEI: "0 3 * * 1",
  MONTHLY_ASSET_DISCOVERY: "0 4 1 * *",
  SCOPE_REFRESH: "0 5 * * *",
  SCREENSHOT_UPDATE: "0 6 * * 0",
  REPORT_BACKUP: "0 1 * * *",
  CUSTOM: "0 0 * * *",
};

export type ScheduledJobRunStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";

export interface ScheduledJobDto {
  id: string;
  workspaceId: string;
  projectId: string | null;
  programId: string | null;
  targetId: string | null;
  name: string;
  kind: ScheduledJobKind;
  cronExpression: string;
  config: Record<string, unknown> | null;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastRunStatus: ScheduledJobRunStatus | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateScheduledJobRequestDto {
  projectId?: string;
  programId?: string;
  targetId?: string;
  name: string;
  kind: ScheduledJobKind;
  /// Defaults to `SCHEDULED_JOB_KIND_DEFAULT_CRON[kind]` if omitted.
  cronExpression?: string;
  config?: Record<string, unknown>;
  enabled?: boolean;
}

export type UpdateScheduledJobRequestDto = Partial<
  Omit<CreateScheduledJobRequestDto, "projectId" | "programId" | "targetId">
>;

export interface ListScheduledJobsQueryDto {
  projectId?: string;
  programId?: string;
  kind?: ScheduledJobKind;
  enabled?: boolean;
}

export interface ScheduledJobRunDto {
  id: string;
  scheduledJobId: string;
  status: ScheduledJobRunStatus;
  startedAt: string;
  finishedAt: string | null;
  log: string | null;
  resultSummary: Record<string, unknown> | null;
}

export interface RunScheduledJobNowRequestDto {
  jobId: string;
}

// ---------------------------------------------------------------------------
// Notifications — multi-channel delivery
// ---------------------------------------------------------------------------

export type NotificationChannel =
  | "DESKTOP"
  | "BROWSER"
  | "EMAIL"
  | "WEBHOOK"
  | "DISCORD"
  | "SLACK"
  | "TELEGRAM"
  | "CUSTOM_API";

export const NOTIFICATION_CHANNELS: NotificationChannel[] = [
  "DESKTOP",
  "BROWSER",
  "EMAIL",
  "WEBHOOK",
  "DISCORD",
  "SLACK",
  "TELEGRAM",
  "CUSTOM_API",
];

/// Shape of `NotificationChannelConfig.config` per channel — a discriminated
/// union keyed by the sibling `channel` column (not embedded as a `kind`
/// field here, since the DB row's `channel` column already discriminates).
export type WebhookChannelConfig = { webhookUrl: string };
export type DiscordChannelConfig = { webhookUrl: string };
export type SlackChannelConfig = { webhookUrl: string };
export type TelegramChannelConfig = { botToken: string; chatId: string };
export type CustomApiChannelConfig = { endpoint: string; headers?: Record<string, string> };
export type EmailChannelConfig = { toAddress?: string }; // absent = account email
export type DesktopChannelConfig = Record<string, never>;
export type BrowserChannelConfig = Record<string, never>;

export type NotificationChannelConfigPayload =
  | WebhookChannelConfig
  | DiscordChannelConfig
  | SlackChannelConfig
  | TelegramChannelConfig
  | CustomApiChannelConfig
  | EmailChannelConfig
  | DesktopChannelConfig
  | BrowserChannelConfig;

export interface NotificationChannelConfigDto {
  id: string;
  workspaceId: string;
  userId: string | null;
  channel: NotificationChannel;
  /// Secrets (webhook URLs, bot tokens) are redacted to `"***"` in list
  /// responses — see notifications-channels/to-channel-config-dto.mapper.ts.
  config: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNotificationChannelConfigRequestDto {
  channel: NotificationChannel;
  config: NotificationChannelConfigPayload;
  enabled?: boolean;
}

export type UpdateNotificationChannelConfigRequestDto = Partial<CreateNotificationChannelConfigRequestDto>;

export interface TestNotificationChannelRequestDto {
  channel: NotificationChannel;
}

export interface TestNotificationChannelResultDto {
  channel: NotificationChannel;
  delivered: boolean;
  error: string | null;
}

export interface NotificationDeliveryDto {
  id: string;
  notificationId: string;
  channel: NotificationChannel;
  status: string;
  error: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Public API — API keys, webhook tokens
// ---------------------------------------------------------------------------

export interface ApiKeyDto {
  id: string;
  name: string;
  /// null => a personal key
  workspaceId: string | null;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface CreateApiKeyRequestDto {
  name: string;
  /// Omit for a personal key; set for a workspace key.
  workspaceId?: string;
  scopes?: string[];
  expiresInDays?: number;
}

/// Returned exactly once, at creation — the raw key is never retrievable
/// again afterward (same pattern as a refresh token / password reset
/// token: only the hash is stored).
export interface CreateApiKeyResultDto {
  apiKey: ApiKeyDto;
  rawKey: string;
}

export interface ListApiKeysQueryDto {
  workspaceId?: string;
}

export interface WebhookTokenDto {
  id: string;
  workspaceId: string;
  name: string;
  url: string;
  events: string[];
  enabled: boolean;
  lastTriggeredAt: string | null;
  createdAt: string;
}

/// Module 10 fix: the original list here ("finding.created",
/// "report.submitted", etc.) never actually matched any event's real
/// `verb` string (e.g. the finding event's verb is
/// "bugbounty_finding.created", not "finding.created") — nothing
/// published these events server-side in Module 9, so no delivery was
/// ever possible regardless. This list is now the authoritative catalog
/// of real `ActivityDomainEvent.verb` values WebhookDispatchHandler
/// (apps/api/src/modules/public-api/webhooks/webhook-dispatch.handler.ts)
/// actually listens for and will deliver, plus a `"*"` wildcard meaning
/// "every event that handler subscribes to." Extend both lists together
/// when a future module adds a new deliverable event.
export const WEBHOOK_EVENT_TYPES = [
  "*",
  "bugbounty_finding.created",
  "bugbounty_finding.stage_changed",
  "bugbounty_finding.reported",
  "bug_report.created",
  "bug_report.updated",
  "bug_report.submitted",
  "bug_report.accepted",
  "bug_report.rejected",
  "bug_report.bounty_awarded",
  "bug_report.closed",
  "bugbounty_program.created",
  "bugbounty_program.updated",
  "target.created",
  "target.updated",
  "target.deleted",
  "recon_job.completed",
  "recon_job.failed",
  "vuln_scan_job.completed",
  "vuln_scan_job.failed",
  "vuln_finding.created",
  "vuln_finding.confirmed",
  "vuln_finding.resolved",
  "plugin.installed",
  "plugin.uninstalled",
  "scheduled_job.completed",
  "scheduled_job.failed",
  // Module 13 — Event Bus expansion (task #284). "project.created" and
  // the four "orchestration_run.*" keys are real, already-published
  // ActivityDomainEvents (Module 2/11) now added to
  // WebhookDispatchHandler's subscriber list (deliverable as webhooks,
  // same as everything above this line). "workflow_run.*" are real,
  // newly-published events (WorkflowRunStartedEvent/FinishedEvent,
  // task #283/284) that are NOT workspace-scoped the way
  // ActivityDomainEvent requires (a Workflow can be organization-scoped
  // with no workspaceId) — matchable as an EVENT-triggered Workflow's
  // `trigger.eventKey` (see WorkflowEventTriggerHandler) but not
  // currently deliverable as an outbound webhook. "desktop.sync"/
  // "browser.capture" are reserved (accepted in this catalog, matchable
  // the same way) but have no live NestJS publisher yet — Module 7/8's
  // Desktop Agent/Browser Extension are local-first, client-side
  // systems with no server-side command handler that would naturally
  // `EventBus.publish()` one of these; wiring a real emitter is future
  // work, same disclosed-gap posture as the MCP
  // `desktop_agent_command`/`browser_extension_command` tools.
  "project.created",
  "orchestration_run.created",
  "orchestration_run.completed",
  "orchestration_run.failed",
  "orchestration_run.cancelled",
  "workflow_run.started",
  "workflow_run.finished",
  "desktop.sync",
  "browser.capture",
] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export interface CreateWebhookTokenRequestDto {
  name: string;
  url: string;
  events: WebhookEventType[];
}

export type UpdateWebhookTokenRequestDto = Partial<
  Omit<CreateWebhookTokenRequestDto, "url">
> & { enabled?: boolean };

export interface TestWebhookTokenResultDto {
  delivered: boolean;
  statusCode: number | null;
  error: string | null;
}

/// Module 10 addition — one row per real delivery attempt, returned by
/// the new `GET .../webhooks/:id/deliveries` route so a user can see
/// what actually got sent (and why a delivery failed) instead of only
/// being able to fire a synthetic `test` payload.
export type WebhookDeliveryStatus = "PENDING" | "DELIVERED" | "FAILED" | "DEAD_LETTER";

export interface WebhookDeliveryDto {
  id: string;
  webhookTokenId: string;
  event: string;
  status: WebhookDeliveryStatus;
  attempt: number;
  maxAttempts: number;
  statusCode: number | null;
  error: string | null;
  nextAttemptAt: string;
  deliveredAt: string | null;
  createdAt: string;
}

export interface ListWebhookDeliveriesQueryDto {
  status?: WebhookDeliveryStatus;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export interface SeverityDistributionDto {
  severity: string;
  count: number;
}

export interface VulnTypeCountDto {
  vulnType: string;
  count: number;
}

export interface TargetActivityCountDto {
  targetId: string;
  targetValue: string;
  findingsCount: number;
}

export interface ReconCoverageDto {
  programId: string;
  programName: string;
  scopeItemsTotal: number;
  scopeItemsWithLinkedTarget: number;
  coveragePercent: number;
}

export interface ResponseTimeStatsDto {
  averageTimeToTriagedHours: number;
  averageTimeToResolvedHours: number;
  medianTimeToTriagedHours: number;
  medianTimeToResolvedHours: number;
}

export interface ActivityTimelinePointDto {
  date: string;
  eventCount: number;
}

export interface BugBountyAnalyticsDto {
  programsCount: number;
  findingsCount: number;
  severityDistribution: SeverityDistributionDto[];
  acceptanceRate: number;
  duplicateRate: number;
  topVulnTypes: VulnTypeCountDto[];
  topTargets: TargetActivityCountDto[];
  reconCoverage: ReconCoverageDto[];
  responseTime: ResponseTimeStatsDto;
  activityTimeline: ActivityTimelinePointDto[];
}

export interface AnalyticsQueryDto {
  projectId?: string;
  programId?: string;
  from?: string;
  to?: string;
}
