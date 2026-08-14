import { describe, expect, it, jest } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { UserPreferencesRepository } from '../user-preferences/domain/repositories/user-preferences.repository.interface.js';
import type { UserPreferences } from '../../prisma-types.js';
import { TelemetryCollectorService } from './telemetry-collector.service.js';

/// Module 15 — task #347. Covers the two independent gates (operator
/// TELEMETRY_ENABLED, per-user telemetryOptOut), the counting behavior,
/// and flush()'s send/reset/skip paths. Not a full end-to-end network
/// test — fetch is mocked, and assertions focus on when/what it's called
/// with rather than parsing a real response.
function buildService(overrides?: {
  enabled?: boolean;
  endpoint?: string;
  edition?: 'community' | 'enterprise';
  preferences?: Partial<UserPreferences> | null;
  earliestUser?: { id: string } | null;
}) {
  const config: Record<string, unknown> = {
    TELEMETRY_ENABLED: overrides?.enabled ?? true,
    TELEMETRY_ENDPOINT: overrides?.endpoint,
    PENTESTHUB_EDITION: overrides?.edition ?? 'community',
  };
  const configService = {
    get: jest.fn((key: string) => config[key]),
  } as unknown as ConfigService;

  const prisma = {
    user: {
      findFirst: jest
        .fn<() => Promise<{ id: string } | null>>()
        .mockResolvedValue(
          overrides?.earliestUser === undefined ? { id: 'user-1' } : overrides.earliestUser,
        ),
    },
  } as unknown as PrismaService;

  const userPreferencesRepository = {
    findByUserId: jest
      .fn<() => Promise<UserPreferences | null>>()
      .mockResolvedValue(
        overrides?.preferences === undefined ? null : (overrides.preferences as UserPreferences | null),
      ),
    createDefault: jest.fn(),
    update: jest.fn(),
  } as unknown as jest.Mocked<UserPreferencesRepository>;

  const service = new TelemetryCollectorService(
    configService as unknown as ConfigService<never, true>,
    prisma,
    userPreferencesRepository,
  );
  return { service, configService, prisma, userPreferencesRepository };
}

describe('TelemetryCollectorService', () => {
  it('does not touch the database when telemetry is disabled at the operator level', async () => {
    const { service, userPreferencesRepository } = buildService({ enabled: false });

    await service.record('RECON_JOB:created', 'user-1');

    expect(userPreferencesRepository.findByUserId).not.toHaveBeenCalled();
  });

  it('does not count an event for a user who has opted out', async () => {
    const { service, prisma, userPreferencesRepository } = buildService({
      enabled: true,
      endpoint: 'https://telemetry.example.com/ping',
      preferences: { telemetryOptOut: true },
    });
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));

    await service.record('RECON_JOB:created', 'user-1');
    expect(userPreferencesRepository.findByUserId).toHaveBeenCalledWith('user-1');

    await service.flush();
    // Nothing was ever counted, so flush() has nothing to send.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(prisma.user.findFirst).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it('fails closed (does not count) when the preference lookup itself errors', async () => {
    const { service, userPreferencesRepository } = buildService({ enabled: true });
    userPreferencesRepository.findByUserId.mockRejectedValueOnce(new Error('db unavailable'));

    await service.record('RECON_JOB:created', 'user-1');

    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
    await service.flush();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('counts an event for an opted-in user and for a null (system) actor, and flush() sends both', async () => {
    const { service, prisma } = buildService({
      enabled: true,
      endpoint: 'https://telemetry.example.com/ping',
      preferences: { telemetryOptOut: false },
      earliestUser: { id: 'user-1' },
    });
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));

    await service.record('RECON_JOB:created', 'user-1');
    await service.record('VULN_SCAN_JOB:created', null);
    await service.flush();

    expect(prisma.user.findFirst).toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { featureCounts: Record<string, number> };
    expect(body.featureCounts).toEqual({
      'RECON_JOB:created': 1,
      'VULN_SCAN_JOB:created': 1,
    });

    fetchSpy.mockRestore();
  });

  it('flush() sends nothing and does not touch the DB when no endpoint is configured', async () => {
    const { service, prisma } = buildService({ enabled: true, endpoint: undefined });
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));

    await service.record('RECON_JOB:created', null);
    await service.flush();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('flush() skips sending when there are no accumulated counters', async () => {
    const { service } = buildService({ enabled: true, endpoint: 'https://telemetry.example.com/ping' });
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));

    await service.flush();

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('flush() posts an aggregate ping, resets counters on success, and sends nothing new on the next tick', async () => {
    const { service, prisma } = buildService({
      enabled: true,
      endpoint: 'https://telemetry.example.com/ping',
      edition: 'community',
      earliestUser: { id: 'user-1' },
    });
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));

    await service.record('RECON_JOB:created', null);
    await service.record('RECON_JOB:created', null);
    await service.flush();

    expect(prisma.user.findFirst).toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://telemetry.example.com/ping');
    const body = JSON.parse(init.body as string) as { featureCounts: Record<string, number>; edition: string };
    expect(body.featureCounts).toEqual({ 'RECON_JOB:created': 2 });
    expect(body.edition).toBe('community');

    fetchSpy.mockClear();
    await service.flush();
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it('flush() resets counters (drops the period) even when the send itself fails', async () => {
    const { service } = buildService({
      enabled: true,
      endpoint: 'https://telemetry.example.com/ping',
      earliestUser: { id: 'user-1' },
    });
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network down'));

    await service.record('RECON_JOB:created', null);
    await expect(service.flush()).resolves.toBeUndefined();

    fetchSpy.mockClear();
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));
    await service.flush();
    // No new record() call happened between the two flushes, so the
    // failed period's counts were dropped, not retried.
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it('flush() skips sending when the deployment has no users yet', async () => {
    const { service } = buildService({
      enabled: true,
      endpoint: 'https://telemetry.example.com/ping',
      earliestUser: null,
    });
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));

    await service.record('RECON_JOB:created', null);
    await service.flush();

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('flush() sends nothing when telemetry is disabled at flush time', async () => {
    const { service } = buildService({ enabled: false, endpoint: 'https://telemetry.example.com/ping' });
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));

    await service.flush();

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
