import { describe, expect, it, jest } from '@jest/globals';
import { EventBus } from '@nestjs/cqrs';
import {
  UpdateBugReportCommand,
  UpdateBugReportHandler,
} from './bug-report-lifecycle.commands.js';
import type { WorkspacesRepository } from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  BugReportVersionConflictError,
  type BugReportsRepository,
} from '../domain/repositories/bug-reports.repository.interface.js';
import type { BugReport, Workspace } from '../../../prisma-types.js';

function baseReport(overrides: Partial<BugReport> = {}): BugReport {
  return {
    id: 'report-1',
    workspaceId: 'ws-1',
    projectId: 'proj-1',
    programId: 'program-1',
    findingId: null,
    title: 'Reflected XSS report',
    template: 'MARKDOWN',
    status: 'DRAFT',
    summary: null,
    impact: null,
    stepsToReproduce: null,
    proofOfConcept: null,
    cwe: null,
    cvssScore: null,
    cvssVector: null,
    references: [],
    mitigation: null,
    aiGenerated: false,
    aiModel: null,
    aiGeneratedAt: null,
    bountyAmount: null,
    currency: null,
    platformReportUrl: null,
    platformReportId: null,
    submittedAt: null,
    triagedAt: null,
    resolvedAt: null,
    closedAt: null,
    version: 1,
    createdBy: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  } as unknown as BugReport;
}

function buildHandler(existing: BugReport) {
  const workspace = { id: 'ws-1' } as Workspace;
  const workspacesRepository = {
    findPersonalWorkspaceForUser: jest
      .fn<WorkspacesRepository['findPersonalWorkspaceForUser']>()
      .mockResolvedValue(workspace),
  } as unknown as jest.Mocked<WorkspacesRepository>;
  const reportsRepository = {
    findByIdForWorkspace: jest
      .fn<BugReportsRepository['findByIdForWorkspace']>()
      .mockResolvedValue(existing),
    update: jest.fn<BugReportsRepository['update']>(),
    listEvidenceIds: jest
      .fn<BugReportsRepository['listEvidenceIds']>()
      .mockResolvedValue([]),
  } as unknown as jest.Mocked<BugReportsRepository>;
  const eventBus = { publish: jest.fn() } as unknown as jest.Mocked<EventBus>;

  return {
    handler: new UpdateBugReportHandler(
      workspacesRepository,
      reportsRepository,
      eventBus,
    ),
    eventBus,
    reportsRepository,
  };
}

describe('UpdateBugReportHandler', () => {
  it('translates a stale-version conflict from the repository into BUG_REPORT_VERSION_CONFLICT', async () => {
    const { handler, reportsRepository } = buildHandler(
      baseReport({ version: 3 }),
    );
    reportsRepository.update.mockRejectedValue(
      new BugReportVersionConflictError('report-1'),
    );

    await expect(
      handler.execute(
        new UpdateBugReportCommand('user-1', 'report-1', {
          version: 1,
          summary: 'stale edit',
        }),
      ),
    ).rejects.toMatchObject({ code: 'BUG_REPORT_VERSION_CONFLICT' });
  });

  it('lets an unrelated repository error propagate unchanged', async () => {
    const { handler, reportsRepository } = buildHandler(baseReport());
    reportsRepository.update.mockRejectedValue(new Error('db unreachable'));

    await expect(
      handler.execute(
        new UpdateBugReportCommand('user-1', 'report-1', { version: 1 }),
      ),
    ).rejects.toThrow('db unreachable');
  });

  it('publishes BugReportAccepted only when status actually transitions to ACCEPTED', async () => {
    const { handler, eventBus, reportsRepository } = buildHandler(
      baseReport({ status: 'SUBMITTED' }),
    );
    reportsRepository.update.mockResolvedValue(
      baseReport({ status: 'ACCEPTED' }),
    );

    await handler.execute(
      new UpdateBugReportCommand('user-1', 'report-1', {
        version: 1,
        status: 'ACCEPTED',
      }),
    );

    const verbs = eventBus.publish.mock.calls.map(
      (c) => (c[0] as { verb: string }).verb,
    );
    expect(verbs).toContain('bug_report.accepted');
  });

  it('does not publish a status-transition event when status is left unchanged', async () => {
    const { handler, eventBus, reportsRepository } = buildHandler(
      baseReport({ status: 'SUBMITTED' }),
    );
    reportsRepository.update.mockResolvedValue(
      baseReport({ status: 'SUBMITTED', summary: 'edited' }),
    );

    await handler.execute(
      new UpdateBugReportCommand('user-1', 'report-1', {
        version: 1,
        summary: 'edited',
      }),
    );

    const verbs = eventBus.publish.mock.calls.map(
      (c) => (c[0] as { verb: string }).verb,
    );
    expect(verbs).toEqual(['bug_report.updated']);
  });

  it('publishes BountyAwarded when bountyAmount changes from its previous value', async () => {
    const { handler, eventBus, reportsRepository } = buildHandler(
      baseReport({ status: 'ACCEPTED', bountyAmount: null }),
    );
    reportsRepository.update.mockResolvedValue(
      baseReport({ status: 'ACCEPTED', bountyAmount: 500, currency: 'USD' }),
    );

    await handler.execute(
      new UpdateBugReportCommand('user-1', 'report-1', {
        version: 1,
        bountyAmount: 500,
        currency: 'USD',
      }),
    );

    const verbs = eventBus.publish.mock.calls.map(
      (c) => (c[0] as { verb: string }).verb,
    );
    expect(verbs).toContain('bug_report.bounty_awarded');
  });

  it('rejects updating a report that does not belong to the caller workspace (enumeration-safe 404)', async () => {
    const workspace = { id: 'ws-1' } as Workspace;
    const workspacesRepository = {
      findPersonalWorkspaceForUser: jest
        .fn<WorkspacesRepository['findPersonalWorkspaceForUser']>()
        .mockResolvedValue(workspace),
    } as unknown as jest.Mocked<WorkspacesRepository>;
    const reportsRepository = {
      findByIdForWorkspace: jest
        .fn<BugReportsRepository['findByIdForWorkspace']>()
        .mockResolvedValue(null),
    } as unknown as jest.Mocked<BugReportsRepository>;
    const eventBus = { publish: jest.fn() } as unknown as jest.Mocked<EventBus>;
    const handler = new UpdateBugReportHandler(
      workspacesRepository,
      reportsRepository,
      eventBus,
    );

    await expect(
      handler.execute(
        new UpdateBugReportCommand('user-1', 'missing', { version: 1 }),
      ),
    ).rejects.toMatchObject({ code: 'BUG_REPORT_NOT_FOUND' });
  });
});
