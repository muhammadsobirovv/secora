import { describe, expect, it, jest } from '@jest/globals';
import type {
  AgentOrchestrationRepository,
  OrchestrationRunRecord,
} from './domain/repositories/agent-orchestration.repository.interface.js';
import type { WorkspacesRepository } from '../workspaces/domain/repositories/workspaces.repository.interface.js';
import { resolveOrchestrationRunForCaller, resolveWorkspaceForCaller } from './agent-authorization.util.js';

/// Module 11 — Controllers + Swagger + module wiring + events (task #236).
/// Same enumeration-safe-404 workspace-isolation pattern already covered
/// for Module 5's resolveAiConversationForCaller — verifies an
/// orchestration run belonging to another workspace, and one that simply
/// doesn't exist, both resolve to the identical ORCHESTRATION_RUN_NOT_FOUND
/// (Security: Workspace Isolation).
function run(overrides: Partial<OrchestrationRunRecord> = {}): OrchestrationRunRecord {
  return {
    id: 'run-1',
    workspaceId: 'ws-mine',
    projectId: null,
    userId: 'user-1',
    goal: 'Recon and triage api.example.com',
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

function buildRepos() {
  const repository = {
    findRunById: jest.fn<AgentOrchestrationRepository['findRunById']>(),
  } as unknown as jest.Mocked<AgentOrchestrationRepository>;
  const workspacesRepository = {
    findPersonalWorkspaceForUser: jest.fn<WorkspacesRepository['findPersonalWorkspaceForUser']>(),
  } as unknown as jest.Mocked<WorkspacesRepository>;
  return { repository, workspacesRepository };
}

const MY_WORKSPACE = { id: 'ws-mine' } as Awaited<
  ReturnType<WorkspacesRepository['findPersonalWorkspaceForUser']>
>;

describe('resolveOrchestrationRunForCaller (workspace isolation)', () => {
  it('returns the run when it belongs to the caller workspace', async () => {
    const { repository, workspacesRepository } = buildRepos();
    workspacesRepository.findPersonalWorkspaceForUser.mockResolvedValue(MY_WORKSPACE);
    repository.findRunById.mockResolvedValue(run({ workspaceId: 'ws-mine' }));

    const result = await resolveOrchestrationRunForCaller(
      repository,
      workspacesRepository,
      'user-1',
      'run-1',
    );
    expect(result.workspaceId).toBe('ws-mine');
  });

  it('throws ORCHESTRATION_RUN_NOT_FOUND when the run belongs to a different workspace', async () => {
    const { repository, workspacesRepository } = buildRepos();
    workspacesRepository.findPersonalWorkspaceForUser.mockResolvedValue(MY_WORKSPACE);
    repository.findRunById.mockResolvedValue(run({ workspaceId: 'ws-someone-elses' }));

    await expect(
      resolveOrchestrationRunForCaller(repository, workspacesRepository, 'user-1', 'run-1'),
    ).rejects.toMatchObject({ code: 'ORCHESTRATION_RUN_NOT_FOUND' });
  });

  it('throws the identical ORCHESTRATION_RUN_NOT_FOUND (not a different error) when the run simply does not exist', async () => {
    // Deliberately identical to the cross-workspace case above — a caller
    // must not be able to distinguish "doesn't exist" from "exists in
    // another workspace" (enumeration-safe 404).
    const { repository, workspacesRepository } = buildRepos();
    workspacesRepository.findPersonalWorkspaceForUser.mockResolvedValue(MY_WORKSPACE);
    repository.findRunById.mockResolvedValue(null);

    await expect(
      resolveOrchestrationRunForCaller(repository, workspacesRepository, 'user-1', 'run-missing'),
    ).rejects.toMatchObject({ code: 'ORCHESTRATION_RUN_NOT_FOUND' });
  });

  it('throws WORKSPACE_NOT_FOUND when the caller has no personal workspace, without querying the run', async () => {
    const { repository, workspacesRepository } = buildRepos();
    workspacesRepository.findPersonalWorkspaceForUser.mockResolvedValue(null);

    await expect(
      resolveOrchestrationRunForCaller(repository, workspacesRepository, 'ghost-user', 'run-1'),
    ).rejects.toMatchObject({ code: 'WORKSPACE_NOT_FOUND' });
    expect(repository.findRunById).not.toHaveBeenCalled();
  });
});

describe('resolveWorkspaceForCaller', () => {
  it('returns the caller personal workspace', async () => {
    const { workspacesRepository } = buildRepos();
    workspacesRepository.findPersonalWorkspaceForUser.mockResolvedValue(MY_WORKSPACE);

    const result = await resolveWorkspaceForCaller(workspacesRepository, 'user-1');
    expect(result.id).toBe('ws-mine');
  });

  it('throws WORKSPACE_NOT_FOUND when the caller has no personal workspace', async () => {
    const { workspacesRepository } = buildRepos();
    workspacesRepository.findPersonalWorkspaceForUser.mockResolvedValue(null);

    await expect(resolveWorkspaceForCaller(workspacesRepository, 'ghost-user')).rejects.toMatchObject({
      code: 'WORKSPACE_NOT_FOUND',
    });
  });
});
