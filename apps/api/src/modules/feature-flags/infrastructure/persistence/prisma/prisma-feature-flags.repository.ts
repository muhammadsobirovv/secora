import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type {
  CreateFeatureFlagInput,
  FeatureFlag,
  FeatureFlagOverride,
  FeatureFlagsRepository,
  SetFeatureFlagOverrideInput,
} from '../../../domain/repositories/feature-flags.repository.interface.js';

/// Module 15 — task #357. Talks to `this.txHost.tx.featureFlag`/
/// `featureFlagOverride` — only resolvable once `npx prisma generate` has
/// run against the models added in task #325 (see the domain interface's
/// doc comment for why that couldn't happen inside this sandbox).
@Injectable()
export class PrismaFeatureFlagsRepository implements FeatureFlagsRepository {
  constructor(private readonly txHost: TransactionHost<AppTransactionalAdapter>) {}

  findAll(): Promise<FeatureFlag[]> {
    return this.txHost.tx.featureFlag.findMany({ orderBy: { key: 'asc' } }) as unknown as Promise<FeatureFlag[]>;
  }

  findById(id: string): Promise<FeatureFlag | null> {
    return this.txHost.tx.featureFlag.findUnique({ where: { id } }) as unknown as Promise<FeatureFlag | null>;
  }

  findByKey(key: string): Promise<FeatureFlag | null> {
    return this.txHost.tx.featureFlag.findUnique({ where: { key } }) as unknown as Promise<FeatureFlag | null>;
  }

  create(input: CreateFeatureFlagInput): Promise<FeatureFlag> {
    return this.txHost.tx.featureFlag.create({
      data: {
        key: input.key,
        description: input.description,
        defaultEnabled: input.defaultEnabled,
        editionRules: input.editionRules ?? undefined,
      },
    }) as unknown as Promise<FeatureFlag>;
  }

  findOverridesForScopes(scopes: { scopeType: string; scopeId: string }[]): Promise<FeatureFlagOverride[]> {
    if (scopes.length === 0) return Promise.resolve([]);
    return this.txHost.tx.featureFlagOverride.findMany({
      where: { OR: scopes.map((scope) => ({ scopeType: scope.scopeType, scopeId: scope.scopeId })) },
    }) as unknown as Promise<FeatureFlagOverride[]>;
  }

  upsertOverride(input: SetFeatureFlagOverrideInput): Promise<FeatureFlagOverride> {
    return this.txHost.tx.featureFlagOverride.upsert({
      where: {
        featureFlagId_scopeType_scopeId: {
          featureFlagId: input.featureFlagId,
          scopeType: input.scopeType,
          scopeId: input.scopeId,
        },
      },
      create: {
        featureFlagId: input.featureFlagId,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        enabled: input.enabled,
      },
      update: { enabled: input.enabled },
    }) as unknown as Promise<FeatureFlagOverride>;
  }
}
