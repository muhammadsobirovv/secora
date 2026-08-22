import { describe, expect, it, jest, afterEach } from '@jest/globals';
import { ThreatIntelProviderService } from './threat-intel-provider.service.js';

/// Module 17 — task #496 (Tests: threat intel provider failure). Covers
/// the graceful-degradation guarantee this service's own doc comment
/// promises: a provider outage must never crash the process, must never
/// silently pretend to have succeeded, and must never partially corrupt
/// the cache. Uses a mocked `global.fetch` to simulate the outage rather
/// than hitting the real CISA KEV/NVD/GitHub endpoints — this is a unit
/// test of `ThreatIntelProviderService`'s own error handling, not an
/// integration test of those third-party feeds.

function buildService(configOverrides: Record<string, unknown> = {}) {
  const logCreate = jest.fn<(args: unknown) => Promise<Record<string, unknown>>>();
  const logUpdate = jest.fn<(args: unknown) => Promise<Record<string, unknown>>>();

  const prisma = {
    threatIntelImportLog: { create: logCreate, update: logUpdate, findMany: jest.fn() },
  } as unknown as ConstructorParameters<typeof ThreatIntelProviderService>[0];

  const defaults: Record<string, unknown> = { THREAT_INTEL_PROVIDER: 'cisa_kev', THREAT_INTEL_MAX_INDICATORS_PER_IMPORT: 500 };
  const configService = {
    get: jest.fn((key: string) => (key in configOverrides ? configOverrides[key] : defaults[key])),
  } as unknown as ConstructorParameters<typeof ThreatIntelProviderService>[1];

  const upsertFromFeed = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const indicators = { upsertFromFeed } as unknown as ConstructorParameters<typeof ThreatIntelProviderService>[2];

  const service = new ThreatIntelProviderService(prisma, configService, indicators);
  return { service, logCreate, logUpdate, upsertFromFeed };
}

describe('ThreatIntelProviderService.refresh — Community Edition guarantee', () => {
  it('throws THREAT_INTEL_PROVIDER_NOT_CONFIGURED and never writes an import log when no provider is configured', async () => {
    const { service, logCreate } = buildService({ THREAT_INTEL_PROVIDER: 'none' });

    await expect(service.refresh()).rejects.toMatchObject({ code: 'THREAT_INTEL_PROVIDER_NOT_CONFIGURED' });
    expect(logCreate).not.toHaveBeenCalled();
  });
});

describe('ThreatIntelProviderService.refresh — provider failure handling', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('marks the import log FAILED and rethrows a wrapped error when the provider fetch throws (network outage) — never crashes uncaught', async () => {
    const { service, logCreate, logUpdate } = buildService();
    logCreate.mockResolvedValue({ id: 'log-1' });
    logUpdate.mockResolvedValue({ id: 'log-1', status: 'FAILED' });
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(service.refresh()).rejects.toMatchObject({ code: 'THREAT_INTEL_PROVIDER_FETCH_FAILED' });

    expect(logUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'log-1' }, data: expect.objectContaining({ status: 'FAILED' }) }),
    );
  });

  it('marks the import log FAILED and rethrows when the provider responds with a non-OK HTTP status', async () => {
    const { service, logCreate, logUpdate } = buildService();
    logCreate.mockResolvedValue({ id: 'log-2' });
    logUpdate.mockResolvedValue({ id: 'log-2', status: 'FAILED' });
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 503 } as Response);

    await expect(service.refresh()).rejects.toMatchObject({ code: 'THREAT_INTEL_PROVIDER_FETCH_FAILED' });
    expect(logUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
  });

  it('records status PARTIAL (not FAILED, not silently SUCCEEDED) when some fetched indicators import and some are rejected', async () => {
    const { service, logCreate, logUpdate, upsertFromFeed } = buildService();
    logCreate.mockResolvedValue({ id: 'log-3' });
    logUpdate.mockResolvedValue({ id: 'log-3', status: 'PARTIAL' });
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        vulnerabilities: [
          { cveID: 'CVE-2024-0001', shortDescription: 'x' },
          { cveID: 'CVE-2024-0002', shortDescription: 'y' },
        ],
      }),
    } as Response);
    upsertFromFeed.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('validation failed'));

    await service.refresh();

    const args = logUpdate.mock.calls[0][0] as { data: { status: string; importedCount: number; rejectedCount: number } };
    expect(args.data.status).toBe('PARTIAL');
    expect(args.data.importedCount).toBe(1);
    expect(args.data.rejectedCount).toBe(1);
  });

  it('caps the number of indicators imported per run at THREAT_INTEL_MAX_INDICATORS_PER_IMPORT and counts the overflow as rejected', async () => {
    const { service, logCreate, logUpdate, upsertFromFeed } = buildService({ THREAT_INTEL_MAX_INDICATORS_PER_IMPORT: 1 });
    logCreate.mockResolvedValue({ id: 'log-4' });
    logUpdate.mockResolvedValue({ id: 'log-4' });
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        vulnerabilities: [
          { cveID: 'CVE-2024-0001', shortDescription: 'x' },
          { cveID: 'CVE-2024-0002', shortDescription: 'y' },
        ],
      }),
    } as Response);
    upsertFromFeed.mockResolvedValue(undefined);

    await service.refresh();

    expect(upsertFromFeed).toHaveBeenCalledTimes(1); // only the first, capped at 1
    const args = logUpdate.mock.calls[0][0] as { data: { importedCount: number; rejectedCount: number } };
    expect(args.data.importedCount).toBe(1);
    expect(args.data.rejectedCount).toBe(1); // the overflowed second item
  });
});
