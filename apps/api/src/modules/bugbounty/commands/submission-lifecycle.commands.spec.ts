import { describe, expect, it, jest } from '@jest/globals';
import { EventBus } from '@nestjs/cqrs';
import type { WorkspacesRepository } from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import type { BugBountyFindingsRepository } from '../domain/repositories/bugbounty-findings.repository.interface.js';
import type { SubmissionsRepository } from '../domain/repositories/submissions.repository.interface.js';
import {
  CreateSubmissionCommand,
  CreateSubmissionHandler,
  UpdateSubmissionStatusCommand,
  UpdateSubmissionStatusHandler,
} from './submission-lifecycle.commands.js';

/// Module 16 — Bug Bounty Submissions + Rewards (task #385). Security
/// regression coverage for the spec's explicit requirement: "Never allow
/// submission creation for a finding belonging to another workspace" —
/// plus the equivalent tenant-isolation check on the status-update path.
describe('CreateSubmissionHandler — tenant isolation', () => {
  function buildHandler(opts: {
    callerWorkspaceId: string;
    findingWorkspaceId: string | null; // null = finding not found at all
    create?: jest.Mock;
  }) {
    const workspacesRepository: Partial<WorkspacesRepository> = {
      findPersonalWorkspaceForUser: jest.fn(async () => ({
        id: opts.callerWorkspaceId,
      })) as unknown as WorkspacesRepository['findPersonalWorkspaceForUser'],
    };
    const findingsRepository: Partial<BugBountyFindingsRepository> = {
      // findByIdForWorkspace is the enumeration-safe lookup — it only
      // returns a row when the finding's workspaceId equals the workspace
      // passed in, so a cross-tenant finding id or a nonexistent one both
      // resolve to `null` here (resolveBugBountyFindingForCaller then
      // throws the same BUGBOUNTY_FINDING_NOT_FOUND for both).
      findByIdForWorkspace: jest.fn(async (_id: string, workspaceId: string) => {
        if (opts.findingWorkspaceId === null || opts.findingWorkspaceId !== workspaceId) {
          return null;
        }
        return {
          id: 'finding-1',
          workspaceId: opts.findingWorkspaceId,
          projectId: 'project-1',
          programId: 'program-1',
        };
      }) as unknown as BugBountyFindingsRepository['findByIdForWorkspace'],
    };
    const create =
      opts.create ??
      (jest.fn(async () => ({
        id: 'submission-1',
        programId: 'program-1',
        findingId: 'finding-1',
        bugReportId: null,
        title: 't',
        severity: 'HIGH',
        status: 'DRAFT',
        submittedAt: null,
        responseAt: null,
        reward: null,
        currency: 'USD',
        platform: 'HACKERONE',
        externalId: null,
        externalUrl: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })) as jest.Mock);
    const submissionsRepository: Partial<SubmissionsRepository> = {
      create: create as unknown as SubmissionsRepository['create'],
    };
    const eventBus = { publish: jest.fn() } as unknown as EventBus;

    const handler = new CreateSubmissionHandler(
      workspacesRepository as WorkspacesRepository,
      findingsRepository as BugBountyFindingsRepository,
      submissionsRepository as SubmissionsRepository,
      eventBus,
    );
    return { handler, create, eventBus };
  }

  it('creates a submission when the finding belongs to the caller’s own workspace', async () => {
    const { handler, create } = buildHandler({
      callerWorkspaceId: 'workspace-1',
      findingWorkspaceId: 'workspace-1',
    });

    const result = await handler.execute(
      new CreateSubmissionCommand('user-1', {
        findingId: 'finding-1',
        title: 'Reflected XSS',
        severity: 'HIGH',
        platform: 'HACKERONE',
      }),
    );

    expect(create).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('submission-1');
  });

  it('rejects submission creation when the finding belongs to a different workspace (404, not 403 — enumeration-safe)', async () => {
    const { handler, create } = buildHandler({
      callerWorkspaceId: 'workspace-1',
      findingWorkspaceId: 'workspace-2', // someone else's finding
    });

    await expect(
      handler.execute(
        new CreateSubmissionCommand('user-1', {
          findingId: 'finding-1',
          title: 'Reflected XSS',
          severity: 'HIGH',
          platform: 'HACKERONE',
        }),
      ),
    ).rejects.toMatchObject({ code: 'BUGBOUNTY_FINDING_NOT_FOUND' });

    expect(create).not.toHaveBeenCalled();
  });

  it('rejects submission creation for a nonexistent finding with the identical error as a cross-tenant one', async () => {
    const { handler, create } = buildHandler({
      callerWorkspaceId: 'workspace-1',
      findingWorkspaceId: null,
    });

    await expect(
      handler.execute(
        new CreateSubmissionCommand('user-1', {
          findingId: 'does-not-exist',
          title: 'Reflected XSS',
          severity: 'HIGH',
          platform: 'HACKERONE',
        }),
      ),
    ).rejects.toMatchObject({ code: 'BUGBOUNTY_FINDING_NOT_FOUND' });

    expect(create).not.toHaveBeenCalled();
  });
});

describe('UpdateSubmissionStatusHandler — tenant isolation', () => {
  function buildHandler(opts: {
    callerWorkspaceId: string;
    submissionWorkspaceId: string | null;
    updateStatus?: jest.Mock;
    createRewardLedgerEntry?: jest.Mock;
  }) {
    const workspacesRepository: Partial<WorkspacesRepository> = {
      findPersonalWorkspaceForUser: jest.fn(async () => ({
        id: opts.callerWorkspaceId,
      })) as unknown as WorkspacesRepository['findPersonalWorkspaceForUser'],
    };
    const existingSubmission =
      opts.submissionWorkspaceId === null
        ? null
        : {
            id: 'submission-1',
            workspaceId: opts.submissionWorkspaceId,
            projectId: 'project-1',
            programId: 'program-1',
            findingId: 'finding-1',
            status: 'SUBMITTED',
            submittedAt: new Date(),
            responseAt: null,
            reward: null,
            currency: 'USD',
          };
    const updateStatus =
      opts.updateStatus ??
      (jest.fn(async () => ({
        ...existingSubmission,
        status: 'ACCEPTED',
        updatedAt: new Date(),
        createdAt: new Date(),
        title: 't',
        severity: 'HIGH',
        platform: 'HACKERONE',
        bugReportId: null,
        externalId: null,
        externalUrl: null,
        notes: null,
      })) as jest.Mock);
    const submissionsRepository: Partial<SubmissionsRepository> = {
      findByIdForWorkspace: jest.fn(async (_id: string, workspaceId: string) => {
        if (!existingSubmission || existingSubmission.workspaceId !== workspaceId) {
          return null;
        }
        return existingSubmission;
      }) as unknown as SubmissionsRepository['findByIdForWorkspace'],
      updateStatus: updateStatus as unknown as SubmissionsRepository['updateStatus'],
      createRewardLedgerEntry: (opts.createRewardLedgerEntry ??
        jest.fn()) as unknown as SubmissionsRepository['createRewardLedgerEntry'],
    };
    const eventBus = { publish: jest.fn() } as unknown as EventBus;

    const handler = new UpdateSubmissionStatusHandler(
      workspacesRepository as WorkspacesRepository,
      submissionsRepository as SubmissionsRepository,
      eventBus,
    );
    return { handler, updateStatus, eventBus };
  }

  it('updates status when the submission belongs to the caller’s own workspace', async () => {
    const { handler, updateStatus } = buildHandler({
      callerWorkspaceId: 'workspace-1',
      submissionWorkspaceId: 'workspace-1',
    });

    const result = await handler.execute(
      new UpdateSubmissionStatusCommand('user-1', 'submission-1', { status: 'ACCEPTED' }),
    );

    expect(updateStatus).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('ACCEPTED');
  });

  it('rejects a status update for a submission belonging to a different workspace', async () => {
    const { handler, updateStatus } = buildHandler({
      callerWorkspaceId: 'workspace-1',
      submissionWorkspaceId: 'workspace-2',
    });

    await expect(
      handler.execute(
        new UpdateSubmissionStatusCommand('user-1', 'submission-1', { status: 'ACCEPTED' }),
      ),
    ).rejects.toMatchObject({ code: 'SUBMISSION_NOT_FOUND' });

    expect(updateStatus).not.toHaveBeenCalled();
  });

  it('rejects a status update for a nonexistent submission with the identical error', async () => {
    const { handler, updateStatus } = buildHandler({
      callerWorkspaceId: 'workspace-1',
      submissionWorkspaceId: null,
    });

    await expect(
      handler.execute(
        new UpdateSubmissionStatusCommand('user-1', 'does-not-exist', { status: 'ACCEPTED' }),
      ),
    ).rejects.toMatchObject({ code: 'SUBMISSION_NOT_FOUND' });

    expect(updateStatus).not.toHaveBeenCalled();
  });

  it('writes a RewardLedgerEntry when a reward is recorded on an eligible status', async () => {
    const createRewardLedgerEntry = jest.fn(async () => ({
      id: 'ledger-1',
      submissionId: 'submission-1',
      programId: 'program-1',
      amount: 500,
      currency: 'USD',
      feeAmount: 0,
      netAmount: 500,
      occurredAt: new Date(),
      notes: null,
    }));
    const { handler } = buildHandler({
      callerWorkspaceId: 'workspace-1',
      submissionWorkspaceId: 'workspace-1',
      createRewardLedgerEntry,
    });

    await handler.execute(
      new UpdateSubmissionStatusCommand('user-1', 'submission-1', {
        status: 'BOUNTY_PAID',
        reward: 500,
        currency: 'USD',
      }),
    );

    expect(createRewardLedgerEntry).toHaveBeenCalledTimes(1);
    expect(createRewardLedgerEntry).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'workspace-1', amount: 500, netAmount: 500 }),
    );
  });

  it('does not write a RewardLedgerEntry for a bare status change with no reward field in the request', async () => {
    const createRewardLedgerEntry = jest.fn();
    const { handler } = buildHandler({
      callerWorkspaceId: 'workspace-1',
      submissionWorkspaceId: 'workspace-1',
      createRewardLedgerEntry,
    });

    await handler.execute(
      new UpdateSubmissionStatusCommand('user-1', 'submission-1', { status: 'TRIAGED' }),
    );

    expect(createRewardLedgerEntry).not.toHaveBeenCalled();
  });
});
