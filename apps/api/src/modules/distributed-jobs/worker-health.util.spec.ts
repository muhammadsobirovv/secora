import { describe, expect, it } from '@jest/globals';
import { isWorkerStale } from './worker-health.util.js';

describe('isWorkerStale', () => {
  it('is not stale when the heartbeat is recent', () => {
    const worker = { lastHeartbeatAt: new Date(), status: 'ONLINE' as const };
    expect(isWorkerStale(worker, 90_000)).toBe(false);
  });

  it('is stale when the heartbeat is older than staleMs', () => {
    const worker = { lastHeartbeatAt: new Date(Date.now() - 120_000), status: 'ONLINE' as const };
    expect(isWorkerStale(worker, 90_000)).toBe(true);
  });

  it('is stale right at the boundary minus one ms', () => {
    const worker = { lastHeartbeatAt: new Date(Date.now() - 90_001), status: 'ONLINE' as const };
    expect(isWorkerStale(worker, 90_000)).toBe(true);
  });

  it('is not stale exactly at the boundary', () => {
    const worker = { lastHeartbeatAt: new Date(Date.now() - 90_000), status: 'ONLINE' as const };
    expect(isWorkerStale(worker, 90_000)).toBe(false);
  });

  it('an OFFLINE (intentionally deregistered/never-started) worker is never considered stale', () => {
    const worker = { lastHeartbeatAt: new Date(Date.now() - 10_000_000), status: 'OFFLINE' as const };
    expect(isWorkerStale(worker, 90_000)).toBe(false);
  });

  it('a DRAINING worker with an old heartbeat is still considered stale', () => {
    const worker = { lastHeartbeatAt: new Date(Date.now() - 120_000), status: 'DRAINING' as const };
    expect(isWorkerStale(worker, 90_000)).toBe(true);
  });
});
