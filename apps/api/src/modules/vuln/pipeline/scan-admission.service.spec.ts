import { describe, expect, it, jest } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../../config/env.validation.js';
import type { VulnScanJobsRepository } from '../domain/repositories/vuln-scan-jobs.repository.interface.js';
import { ScanAdmissionService } from './scan-admission.service.js';

function build(counts: { active?: number; target?: number; workspace?: number }) {
  const jobs = {
    countActiveForTarget: jest.fn(async () => counts.active ?? 0),
    countCreatedSince: jest.fn(async (filter: { targetId?: string; workspaceId?: string }) =>
      filter.targetId ? (counts.target ?? 0) : (counts.workspace ?? 0),
    ),
  } as unknown as jest.Mocked<VulnScanJobsRepository>;
  const config: Record<string, number> = {
    VULN_SCAN_MAX_PER_TARGET_PER_HOUR: 6,
    VULN_SCAN_MAX_PER_WORKSPACE_PER_HOUR: 30,
  };
  const configService = { get: jest.fn((key: string) => config[key]) } as unknown as ConfigService<EnvConfig, true>;
  return { service: new ScanAdmissionService(jobs, configService), jobs };
}

const input = { workspaceId: 'ws-1', targetId: 't-1' };

describe('ScanAdmissionService', () => {
  it('allows a scan under every limit', async () => {
    const { service } = build({ active: 0, target: 5, workspace: 29 });
    await expect(service.assertAllowed(input)).resolves.toBeUndefined();
  });

  it('refuses a second scan while one is queued or running for the target (429)', async () => {
    const { service } = build({ active: 1 });
    await expect(service.assertAllowed(input)).rejects.toMatchObject({
      code: 'SCAN_TARGET_BUSY',
      status: 429,
    });
  });

  it('refuses when the per-target hourly limit is reached', async () => {
    const { service } = build({ target: 6 });
    await expect(service.assertAllowed(input)).rejects.toMatchObject({
      code: 'SCAN_RATE_LIMITED',
      status: 429,
    });
  });

  it('refuses when the per-workspace hourly limit is reached', async () => {
    const { service } = build({ target: 0, workspace: 30 });
    await expect(service.assertAllowed(input)).rejects.toMatchObject({
      code: 'SCAN_RATE_LIMITED',
      status: 429,
    });
  });

  it('counts only the last rolling hour', async () => {
    const { service, jobs } = build({});
    const now = new Date('2026-10-21T12:00:00Z');
    await service.assertAllowed({ ...input, now });
    const sinceValues = jobs.countCreatedSince.mock.calls.map((call) => call[0].since.toISOString());
    expect(new Set(sinceValues)).toEqual(new Set(['2026-10-21T11:00:00.000Z']));
  });
});
