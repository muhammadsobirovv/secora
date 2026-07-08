import { describe, expect, it, jest } from '@jest/globals';
import { ActivityRecordingHandler } from './activity-recording.handler.js';
import { ProjectCreatedEvent } from '../../projects/events/project-events.js';
import { TargetUpdatedEvent } from '../../targets/events/target-events.js';
import type { ActivityRepository } from '../domain/repositories/activity.repository.interface.js';
import type { ActivityEvent } from '../../../prisma-types.js';

/// This handler is what makes the timeline "generic enough for future
/// modules" (docs/adr/0002-workspace-foundation-module.md, Decision 2) —
/// it never imports a feature module's repository or service, only event
/// classes. These tests exercise that indirection actually works: two
/// unrelated events (Project, Target) both resolve to the same
/// ActivityEvent shape through the one shared handler.
describe('ActivityRecordingHandler', () => {
  function build() {
    const activityRepository = {
      record: jest.fn<ActivityRepository['record']>(),
    } as unknown as jest.Mocked<ActivityRepository>;
    return {
      handler: new ActivityRecordingHandler(activityRepository),
      activityRepository,
    };
  }

  it('records a ProjectCreatedEvent as an ActivityEvent row with matching fields', async () => {
    const { handler, activityRepository } = build();
    activityRepository.record.mockResolvedValue({} as ActivityEvent);

    await handler.handle(
      new ProjectCreatedEvent('ws-1', 'proj-1', 'user-1', { extra: 'meta' }),
    );

    expect(activityRepository.record).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      actorUserId: 'user-1',
      verb: 'project.created',
      entityType: 'Project',
      entityId: 'proj-1',
      metadata: { extra: 'meta' },
    });
  });

  it('records a TargetUpdatedEvent the same way, with no knowledge of the Targets module', async () => {
    const { handler, activityRepository } = build();
    activityRepository.record.mockResolvedValue({} as ActivityEvent);

    await handler.handle(
      new TargetUpdatedEvent('ws-1', 'proj-1', 'user-1', 'target-1'),
    );

    expect(activityRepository.record).toHaveBeenCalledWith(
      expect.objectContaining({
        verb: 'target.updated',
        entityType: 'Target',
        entityId: 'target-1',
      }),
    );
  });
});
