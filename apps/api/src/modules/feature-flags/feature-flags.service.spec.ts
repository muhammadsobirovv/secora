import { describe, expect, it, jest } from '@jest/globals';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { EditionService } from '../infrastructure/edition.service.js';
import type { FeatureFlag, FeatureFlagsRepository } from './domain/repositories/feature-flags.repository.interface.js';
import { FeatureFlagsService } from './feature-flags.service.js';

/// Module 15 — task #357/#362. Sandbox disclosure: `jest` is not runnable
/// in this development sandbox (the package is physically absent from
/// the local pnpm store — same standing gap disclosed throughout Module
/// 15's tasks). This file is written and manually traced against
/// `FeatureFlagsService`'s actual control flow but has not been executed
/// here; it must be run (`pnpm --filter api test`) on a normal machine
/// before this module ships.
function buildService(opts: { flags: FeatureFlag[]; overrides?: { featureFlagId: string; scopeType: string; scopeId: string; enabled: boolean }[]; isEnterprise?: boolean; isSelfHosted?: boolean; licenseCount?: number; subscription?: { plan: { tier: string } } | null }) {
  const repository: Partial<FeatureFlagsRepository> = {
    findAll: jest.fn(async () => opts.flags),
    findOverridesForScopes: jest.fn(async () => opts.overrides ?? []),
  };
  const editionService: Partial<EditionService> = {
    isEnterpriseFor: jest.fn(async () => opts.isEnterprise ?? false),
  };
  const prisma: Partial<PrismaService> = {
    license: { count: jest.fn(async () => opts.licenseCount ?? 0) } as never,
    subscription: { findUnique: jest.fn(async () => opts.subscription ?? null) } as never,
  };
  const service = new FeatureFlagsService(
    repository as FeatureFlagsRepository,
    editionService as EditionService,
    prisma as PrismaService,
  );
  return { service, repository };
}

function flag(overrides: Partial<FeatureFlag> = {}): FeatureFlag {
  return {
    id: 'flag-1',
    key: 'new-report-builder',
    description: 'test flag',
    defaultEnabled: false,
    editionRules: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('FeatureFlagsService.evaluateAll', () => {
  it('falls back to defaultEnabled when there are no overrides and no editionRules', async () => {
    const { service } = buildService({ flags: [flag({ defaultEnabled: true })] });
    const result = await service.evaluateAll({ userId: 'user-1' });
    expect(result.flags['new-report-builder']).toBe(true);
  });

  it('a USER-scoped override beats defaultEnabled', async () => {
    const { service } = buildService({
      flags: [flag({ defaultEnabled: true })],
      overrides: [{ featureFlagId: 'flag-1', scopeType: 'USER', scopeId: 'user-1', enabled: false }],
    });
    const result = await service.evaluateAll({ userId: 'user-1' });
    expect(result.flags['new-report-builder']).toBe(false);
  });

  it('a USER override outranks a WORKSPACE override for the same flag', async () => {
    const { service } = buildService({
      flags: [flag({ defaultEnabled: false })],
      overrides: [
        { featureFlagId: 'flag-1', scopeType: 'WORKSPACE', scopeId: 'ws-1', enabled: true },
        { featureFlagId: 'flag-1', scopeType: 'USER', scopeId: 'user-1', enabled: false },
      ],
    });
    const result = await service.evaluateAll({ userId: 'user-1', workspaceId: 'ws-1' });
    expect(result.flags['new-report-builder']).toBe(false);
  });

  it('minEdition: "enterprise" blocks a Community deployment even when defaultEnabled is true', async () => {
    const { service } = buildService({
      flags: [flag({ defaultEnabled: true, editionRules: { minEdition: 'enterprise' } })],
      isEnterprise: false,
    });
    const result = await service.evaluateAll({ userId: 'user-1', organizationId: 'org-1' });
    expect(result.flags['new-report-builder']).toBe(false);
  });

  it('betaOnly never turns on from defaultEnabled alone, only from an explicit override', async () => {
    const { service: withoutOverride } = buildService({
      flags: [flag({ defaultEnabled: true, editionRules: { betaOnly: true } })],
    });
    expect((await withoutOverride.evaluateAll({ userId: 'user-1' })).flags['new-report-builder']).toBe(false);

    const { service: withOverride } = buildService({
      flags: [flag({ defaultEnabled: true, editionRules: { betaOnly: true } })],
      overrides: [{ featureFlagId: 'flag-1', scopeType: 'USER', scopeId: 'user-1', enabled: true }],
    });
    expect((await withOverride.evaluateAll({ userId: 'user-1' })).flags['new-report-builder']).toBe(true);
  });

  it('planTiers restricts to organizations on a listed plan', async () => {
    const { service: wrongPlan } = buildService({
      flags: [flag({ defaultEnabled: true, editionRules: { planTiers: ['PRO', 'TEAM'] } })],
      subscription: { plan: { tier: 'FREE' } },
    });
    expect((await wrongPlan.evaluateAll({ userId: 'user-1', organizationId: 'org-1' })).flags['new-report-builder']).toBe(false);

    const { service: rightPlan } = buildService({
      flags: [flag({ defaultEnabled: true, editionRules: { planTiers: ['PRO', 'TEAM'] } })],
      subscription: { plan: { tier: 'PRO' } },
    });
    expect((await rightPlan.evaluateAll({ userId: 'user-1', organizationId: 'org-1' })).flags['new-report-builder']).toBe(true);
  });
});

describe('FeatureFlagsService.create', () => {
  it('throws FEATURE_FLAG_KEY_ALREADY_EXISTS when the key is already taken', async () => {
    const repository: Partial<FeatureFlagsRepository> = {
      findByKey: jest.fn(async () => flag()),
    };
    const service = new FeatureFlagsService(
      repository as FeatureFlagsRepository,
      {} as EditionService,
      {} as PrismaService,
    );
    await expect(service.create({ key: 'new-report-builder', description: 'x' })).rejects.toMatchObject({
      code: 'FEATURE_FLAG_KEY_ALREADY_EXISTS',
    });
  });
});
