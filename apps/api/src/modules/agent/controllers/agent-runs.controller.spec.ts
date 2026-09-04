import { describe, expect, it, jest } from '@jest/globals';
import type { CommandBus, QueryBus } from '@nestjs/cqrs';
import { AgentRunsController } from './agent-runs.controller.js';
import { AgentOrchestrationStreamHubService } from '../orchestrator/agent-orchestration-stream-hub.service.js';
import type { AgentOrchestratorService } from '../orchestrator/agent-orchestrator.service.js';
import type {
  AgentOrchestrationRepository,
  OrchestrationRunRecord,
} from '../domain/repositories/agent-orchestration.repository.interface.js';
import type { WorkspacesRepository } from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';

/// Module 18 — task #517 (SSE hardening audit). stream() previously took
/// only `@Param('runId')` with no `@CurrentUser()` at all — any
/// authenticated user who knew/guessed another workspace's runId got that
/// workspace's live orchestration events or terminal result. This spec
/// proves the fix: authorization via resolveOrchestrationRunForCaller
/// happens, and rejects, before the stream hub or orchestrator is ever
/// touched with the caller-supplied runId — using the real
/// AgentOrchestrationStreamHubService (cheap, no external dependencies)
/// so the "never touched" assertion is meaningful rather than trivially
/// true against a stub.
function buildRun(overrides: Partial<OrchestrationRunRecord> = {}): OrchestrationRunRecord {
  return {
    id: 'run-1',
    workspaceId: 'ws-owner',
    projectId: null,
    userId: 'user-owner',
    goal: 'test goal',
    status: 'RUNNING',
    planJson: null,
    resultSummary: null,
    confidenceScore: null,
    errorMessage: null,
    startedAt: new Date(),
    finishedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildController(run: OrchestrationRunRecord | null) {
  const streamHub = new AgentOrchestrationStreamHubService();
  const getSpy = jest.spyOn(streamHub, 'get');

  const orchestrator = {
    getRun: jest.fn(),
  } as unknown as AgentOrchestratorService;

  const orchestrationRepository: AgentOrchestrationRepository = {
    findRunById: jest.fn(async () => run),
  } as unknown as AgentOrchestrationRepository;

  const workspacesRepository: WorkspacesRepository = {
    findPersonalWorkspaceForUser: jest.fn(async () => ({ id: 'ws-caller' })),
  } as unknown as WorkspacesRepository;

  const controller = new AgentRunsController(
    {} as CommandBus,
    {} as QueryBus,
    streamHub,
    orchestrator,
    orchestrationRepository,
    workspacesRepository,
  );

  return { controller, streamHub, getSpy, orchestrator, workspacesRepository };
}

const CALLER = { id: 'user-caller' } as unknown as RequestUser;

describe('AgentRunsController.stream (task #517 fix)', () => {
  it('rejects and never touches the stream hub when the run belongs to another workspace', async () => {
    const { controller, getSpy, orchestrator } = buildController(
      buildRun({ workspaceId: 'ws-someone-else' }),
    );

    const observable = controller.stream('run-1', CALLER);
    await expect(
      new Promise((resolve, reject) => {
        observable.subscribe({ next: resolve, error: reject, complete: resolve });
      }),
    ).rejects.toBeDefined();

    expect(getSpy).not.toHaveBeenCalled();
    expect(orchestrator.getRun).not.toHaveBeenCalled();
  });

  it('rejects when the run does not exist at all, without leaking existence via a different error shape', async () => {
    const { controller, getSpy } = buildController(null);

    const observable = controller.stream('missing-run', CALLER);
    await expect(
      new Promise((resolve, reject) => {
        observable.subscribe({ next: resolve, error: reject, complete: resolve });
      }),
    ).rejects.toBeDefined();

    expect(getSpy).not.toHaveBeenCalled();
  });

  it('streams the active hub subject once the run is confirmed to belong to the caller workspace', async () => {
    const { controller, streamHub } = buildController(buildRun({ workspaceId: 'ws-caller' }));

    const active = streamHub.start('run-1');
    const observable = controller.stream('run-1', CALLER);

    const received: unknown[] = [];
    const done = new Promise<void>((resolve) => {
      observable.subscribe({
        next: (event) => received.push(event),
        complete: resolve,
      });
    });

    // Give the async authorization check a tick to resolve and subscribe
    // to the hub's ReplaySubject before emitting.
    await new Promise((resolve) => setTimeout(resolve, 0));
    active.subject.next({ type: 'cancelled' });
    active.subject.complete();
    await done;

    expect(received).toHaveLength(1);
  });
});
