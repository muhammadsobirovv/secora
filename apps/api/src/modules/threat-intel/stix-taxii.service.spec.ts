import { describe, expect, it, jest } from '@jest/globals';
import { StixTaxiiService } from './stix-taxii.service.js';

/// Module 17 — task #496 (Tests: STIX/TAXII parsing). Every object in an
/// imported bundle is untrusted external data (spec section 38) — this
/// covers the three safety properties the service's own doc comment
/// promises: (1) a non-Bundle payload is rejected outright rather than
/// partially processed, (2) an individual malformed/oversized/
/// unrecognized object is counted as "rejected" rather than crashing the
/// whole import or being silently accepted, and (3) imported content is
/// always scoped to the importing workspace (never `workspaceId: null`,
/// which would make it globally visible — that's reserved for the
/// public-feed adapters in `ThreatIntelProviderService`, never a
/// workspace's own manual/TAXII import).

function buildService() {
  const logCreate = jest.fn<(args: unknown) => Promise<Record<string, unknown>>>();
  const logUpdate = jest.fn<(args: unknown) => Promise<Record<string, unknown>>>();

  const prisma = {
    threatIntelImportLog: { create: logCreate, update: logUpdate },
  } as unknown as ConstructorParameters<typeof StixTaxiiService>[0];

  const configService = { get: jest.fn() } as unknown as ConstructorParameters<typeof StixTaxiiService>[1];

  const upsertFromFeed = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue(undefined);
  const indicators = { upsertFromFeed } as unknown as ConstructorParameters<typeof StixTaxiiService>[2];

  const upsertActor = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue(undefined);
  const catalog = { upsertActor, upsertCampaign: jest.fn(), createReport: jest.fn() } as unknown as ConstructorParameters<typeof StixTaxiiService>[3];

  logCreate.mockResolvedValue({ id: 'log-1' });
  logUpdate.mockImplementation(async (args: unknown) => ({ id: 'log-1', ...(args as { data: Record<string, unknown> }).data }));

  const service = new StixTaxiiService(prisma, configService, indicators, catalog);
  return { service, logCreate, logUpdate, upsertFromFeed, upsertActor };
}

describe('StixTaxiiService.importBundle — malformed payload rejection', () => {
  it('rejects a payload that is not a STIX 2.1 Bundle without attempting to process anything', async () => {
    const { service, logUpdate } = buildService();

    await expect(service.importBundle('ws-1', 'user-1', { type: 'not-a-bundle' })).rejects.toMatchObject({
      code: 'THREAT_INTEL_IMPORT_INVALID',
    });
    expect(logUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }));
  });

  it('rejects a bundle whose "objects" field is not an array', async () => {
    const { service } = buildService();

    await expect(service.importBundle('ws-1', 'user-1', { type: 'bundle', objects: 'not-an-array' })).rejects.toMatchObject({
      code: 'THREAT_INTEL_IMPORT_INVALID',
    });
  });
});

describe('StixTaxiiService.importBundle — per-object safe rejection', () => {
  it('imports a valid indicator object and scopes it to the importing workspace (never global)', async () => {
    const { service, upsertFromFeed } = buildService();
    const bundle = {
      type: 'bundle',
      objects: [{ type: 'indicator', pattern: "[ipv4-addr:value = '203.0.113.9']", confidence: 80 }],
    };

    const result = await service.importBundle('ws-1', 'user-1', bundle);

    expect(result.importedCount).toBe(1);
    expect(result.rejectedCount).toBe(0);
    expect(upsertFromFeed).toHaveBeenCalledTimes(1);
    const [workspaceId] = upsertFromFeed.mock.calls[0] as [string | null, ...unknown[]];
    expect(workspaceId).toBe('ws-1'); // never null for a manual/TAXII import
  });

  it('counts an object with an unsupported/unrecognized type as rejected, not as a thrown error to the caller', async () => {
    const { service } = buildService();
    const bundle = { type: 'bundle', objects: [{ type: 'malware' /* unhandled type */ }] };

    const result = await service.importBundle('ws-1', 'user-1', bundle);

    expect(result.importedCount).toBe(0);
    expect(result.rejectedCount).toBe(1);
    expect(result.status).toBe('FAILED'); // 0 imported, >0 rejected
  });

  it('counts an indicator with a pattern shape it does not recognize as rejected, not as a crash', async () => {
    const { service } = buildService();
    const bundle = { type: 'bundle', objects: [{ type: 'indicator', pattern: "[completely-unsupported-shape]" }] };

    const result = await service.importBundle('ws-1', 'user-1', bundle);

    expect(result.rejectedCount).toBe(1);
    expect(result.importedCount).toBe(0);
  });

  it('counts an indicator with an oversized pattern field as rejected rather than storing it unbounded', async () => {
    const { service, upsertFromFeed } = buildService();
    const hugePattern = "[ipv4-addr:value = '203.0.113.9']" + 'x'.repeat(5000);
    const bundle = { type: 'bundle', objects: [{ type: 'indicator', pattern: hugePattern }] };

    const result = await service.importBundle('ws-1', 'user-1', bundle);

    expect(result.rejectedCount).toBe(1);
    expect(upsertFromFeed).not.toHaveBeenCalled();
  });

  it('truncates an oversized threat-actor description to MAX_STRING_FIELD_LENGTH (4000 chars) rather than storing it unbounded', async () => {
    const { service, upsertActor } = buildService();
    const hugeDescription = 'A'.repeat(10_000);
    const bundle = { type: 'bundle', objects: [{ type: 'threat-actor', name: 'APT-Test', description: hugeDescription }] };

    const result = await service.importBundle('ws-1', 'user-1', bundle);

    expect(result.importedCount).toBe(1);
    const [, , options] = upsertActor.mock.calls[0] as [string, string, { description: string }];
    expect(options.description.length).toBe(4000);
  });

  it('processes a mixed bundle (some valid, some malformed) and reports PARTIAL status with an accurate count of each', async () => {
    const { service } = buildService();
    const bundle = {
      type: 'bundle',
      objects: [
        { type: 'indicator', pattern: "[ipv4-addr:value = '203.0.113.9']" },
        { type: 'unknown-garbage-type' },
        { type: 'threat-actor', name: 'APT-Test' },
      ],
    };

    const result = await service.importBundle('ws-1', 'user-1', bundle);

    expect(result.importedCount).toBe(2);
    expect(result.rejectedCount).toBe(1);
    expect(result.status).toBe('PARTIAL');
  });
});
