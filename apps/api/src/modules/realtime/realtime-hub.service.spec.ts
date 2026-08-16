import { RealtimeHubService } from './realtime-hub.service.js';
import type { RealtimeEvent } from '@pentesthub/shared';

describe('RealtimeHubService', () => {
  it('delivers a published event only to subscribers of the same workspace', () => {
    const hub = new RealtimeHubService();
    const receivedA: RealtimeEvent[] = [];
    const receivedB: RealtimeEvent[] = [];
    hub.subscribe('workspace-a').subscribe((event) => receivedA.push(event));
    hub.subscribe('workspace-b').subscribe((event) => receivedB.push(event));

    const event: RealtimeEvent = {
      category: 'PRESENCE',
      workspaceId: 'workspace-a',
      userId: 'user-1',
      status: 'ONLINE',
      occurredAt: new Date().toISOString(),
    };
    hub.publish('workspace-a', event);

    expect(receivedA).toEqual([event]);
    expect(receivedB).toEqual([]);
  });

  it('delivers events to every subscriber of the same workspace (broadcast)', () => {
    const hub = new RealtimeHubService();
    const receivedFirst: RealtimeEvent[] = [];
    const receivedSecond: RealtimeEvent[] = [];
    hub.subscribe('workspace-a').subscribe((event) => receivedFirst.push(event));
    hub.subscribe('workspace-a').subscribe((event) => receivedSecond.push(event));

    const event: RealtimeEvent = {
      category: 'TYPING',
      workspaceId: 'workspace-a',
      userId: 'user-1',
      entityType: 'Comment',
      entityId: 'comment-1',
      occurredAt: new Date().toISOString(),
    };
    hub.publish('workspace-a', event);

    expect(receivedFirst).toEqual([event]);
    expect(receivedSecond).toEqual([event]);
  });
});
