import { describe, expect, it, jest } from '@jest/globals';
import { ReconJobCreatedEvent } from '../../recon/events/recon-job-events.js';
import { OrchestrationRunCreatedEvent } from '../../agent/events/orchestration-run-events.js';
import type { TelemetryCollectorService } from '../telemetry-collector.service.js';
import { TelemetryRecordingHandler } from './telemetry-recording.handler.js';

/// Module 15 — task #347. Thin adapter test: proves the handler derives
/// the feature key from `entityType:verb` and forwards `actorUserId`
/// unchanged, for both a "real user" actor and a system/null actor.
describe('TelemetryRecordingHandler', () => {
  it('records "<entityType>:<verb>" with the event actor for a user-triggered event', async () => {
    const collector = { record: jest.fn() } as unknown as jest.Mocked<TelemetryCollectorService>;
    const handler = new TelemetryRecordingHandler(collector);
    const event = new ReconJobCreatedEvent('workspace-1', 'project-1', 'user-1', 'job-1');

    await handler.handle(event);

    expect(collector.record).toHaveBeenCalledWith('ReconJob:recon_job.created', 'user-1');
  });

  it('forwards a null actorUserId unchanged for a system-triggered event', async () => {
    const collector = { record: jest.fn() } as unknown as jest.Mocked<TelemetryCollectorService>;
    const handler = new TelemetryRecordingHandler(collector);
    const event = new OrchestrationRunCreatedEvent('workspace-1', null, null, 'run-1');

    await handler.handle(event);

    expect(collector.record).toHaveBeenCalledWith('OrchestrationRun:orchestration_run.created', null);
  });
});
