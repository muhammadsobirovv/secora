import { RealtimePublishHandler } from './realtime-publish.handler.js';
import { RealtimeHubService } from './realtime-hub.service.js';
import { BugBountyFindingCreatedEvent } from '../bugbounty/events/bugbounty-finding-events.js';
import { CommentCreatedEvent, MentionCreatedEvent } from '../collaboration/events/comment-events.js';

/// Module 16 — Real-time gateway (task #391). Covers the two behaviours
/// that matter: (1) a recognized domain event is re-shaped and pushed
/// into the right workspace's hub stream with the right category, and
/// (2) MentionCreatedEvent's `mentionedUserId` becomes `targetUserId` on
/// the outgoing payload (see the handler's own doc comment — this is
/// what lets the SSE controller keep a mention private to the mentioned
/// person instead of broadcasting it to the whole workspace).
describe('RealtimePublishHandler', () => {
  it('publishes a FINDING-category event for BugBountyFindingCreatedEvent', () => {
    const hub = new RealtimeHubService();
    const publishSpy = jest.spyOn(hub, 'publish');
    const handler = new RealtimePublishHandler(hub);

    handler.handle(new BugBountyFindingCreatedEvent('workspace-1', 'project-1', 'user-1', 'finding-1'));

    expect(publishSpy).toHaveBeenCalledWith(
      'workspace-1',
      expect.objectContaining({ category: 'FINDING', entityId: 'finding-1', targetUserId: null }),
    );
  });

  it('publishes a COMMENT-category event with no target user (workspace broadcast)', () => {
    const hub = new RealtimeHubService();
    const publishSpy = jest.spyOn(hub, 'publish');
    const handler = new RealtimePublishHandler(hub);

    handler.handle(new CommentCreatedEvent('workspace-1', 'comment-1', 'user-1'));

    expect(publishSpy).toHaveBeenCalledWith(
      'workspace-1',
      expect.objectContaining({ category: 'COMMENT', targetUserId: null }),
    );
  });

  it('sets targetUserId from MentionCreatedEvent.mentionedUserId', () => {
    const hub = new RealtimeHubService();
    const publishSpy = jest.spyOn(hub, 'publish');
    const handler = new RealtimePublishHandler(hub);

    handler.handle(new MentionCreatedEvent('workspace-1', 'mention-1', 'user-1', 'user-2'));

    expect(publishSpy).toHaveBeenCalledWith(
      'workspace-1',
      expect.objectContaining({ category: 'NOTIFICATION', targetUserId: 'user-2' }),
    );
  });

  it('ignores an event type that is not in the curated realtime list', () => {
    const hub = new RealtimeHubService();
    const publishSpy = jest.spyOn(hub, 'publish');
    const handler = new RealtimePublishHandler(hub);

    // Any ActivityDomainEvent-shaped object whose constructor isn't
    // registered in CATEGORY_BY_EVENT should be a silent no-op.
    class UnrelatedEvent {
      readonly workspaceId = 'workspace-1';
      readonly projectId = null;
      readonly actorUserId = 'user-1';
      readonly verb = 'unrelated.thing';
      readonly entityType = 'Unrelated';
      readonly entityId = 'x';
    }

    handler.handle(new UnrelatedEvent());

    expect(publishSpy).not.toHaveBeenCalled();
  });
});
