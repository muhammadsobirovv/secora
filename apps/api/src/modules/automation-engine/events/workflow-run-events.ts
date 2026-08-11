/// Module 13 — Event Bus expansion (task #284). Not an
/// `ActivityDomainEvent` (that interface requires a non-null
/// `workspaceId`, but a `Workflow` can be organization-scoped with no
/// workspace at all — see `Workflow.workspaceId`'s schema.prisma
/// nullability) — these are plain CQRS events, published by
/// `WorkflowExecutorService.start()`/`finish()`, consumed by
/// `WorkflowEventTriggerHandler` (EVENT-triggered workflows chaining
/// off another workflow's start/finish) and available generally to any
/// future subscriber via `EventBus`.
export class WorkflowRunStartedEvent {
  readonly verb = 'workflow_run.started';
  readonly entityType = 'WorkflowRun';

  constructor(
    public readonly runId: string,
    public readonly workflowId: string,
    public readonly workspaceId: string | null,
    public readonly organizationId: string | null,
  ) {}
}

export class WorkflowRunFinishedEvent {
  readonly verb = 'workflow_run.finished';
  readonly entityType = 'WorkflowRun';

  constructor(
    public readonly runId: string,
    public readonly workflowId: string,
    public readonly workspaceId: string | null,
    public readonly organizationId: string | null,
    public readonly status: 'SUCCEEDED' | 'FAILED',
  ) {}
}
