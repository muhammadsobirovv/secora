import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { EvaluatedFeatureFlagsDto, FeatureFlagDto } from '@pentesthub/shared';
import { AppException } from '../../common/exceptions/app.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EditionService } from '../infrastructure/edition.service.js';
import {
  FEATURE_FLAGS_REPOSITORY,
  type FeatureFlagsRepository,
  type FeatureFlag,
} from './domain/repositories/feature-flags.repository.interface.js';
import { toFeatureFlagDto } from './mappers/to-feature-flag-dto.mapper.js';

export interface EvaluationContext {
  userId: string;
  organizationId?: string | null;
  workspaceId?: string | null;
}

/// Module 15 — task #357. `evaluateAll()` is the one method every other
/// surface should call (a guard, a controller, a future frontend
/// bootstrap request) — `isEnabled()` is a thin convenience wrapper
/// around it for a single flag. Evaluation order, most specific wins:
///
/// 1. `FeatureFlagOverride` at USER scope
/// 2. `FeatureFlagOverride` at WORKSPACE scope (only checked if
///    `context.workspaceId` was supplied — see this class's note on why
///    it's optional)
/// 3. `FeatureFlagOverride` at ORGANIZATION scope (same caveat)
/// 4. `editionRules`, evaluated as an AND of every rule present
/// 5. `defaultEnabled`
///
/// `workspaceId`/`organizationId` are optional on `EvaluationContext`
/// because `RequestUser` (the JWT payload — see
/// `common/types/authenticated-request.ts`) doesn't carry either; a
/// caller that wants workspace/organization-scoped overrides evaluated
/// must resolve and pass them explicitly (the same "not reliably
/// available without new guard infrastructure" gap already disclosed for
/// `SupportTicket.workspaceId` in task #355 — building an implicit
/// "current workspace" resolver is out of scope here).
@Injectable()
export class FeatureFlagsService {
  constructor(
    @Inject(FEATURE_FLAGS_REPOSITORY) private readonly repository: FeatureFlagsRepository,
    private readonly editionService: EditionService,
    private readonly prisma: PrismaService,
  ) {}

  async list(): Promise<FeatureFlagDto[]> {
    const flags = await this.repository.findAll();
    return flags.map(toFeatureFlagDto);
  }

  async create(input: { key: string; description: string; defaultEnabled?: boolean; editionRules?: FeatureFlag['editionRules'] }): Promise<FeatureFlagDto> {
    const existing = await this.repository.findByKey(input.key);
    if (existing) {
      throw new AppException('FEATURE_FLAG_KEY_ALREADY_EXISTS', `A feature flag with key "${input.key}" already exists.`, HttpStatus.CONFLICT);
    }
    const created = await this.repository.create({
      key: input.key,
      description: input.description,
      defaultEnabled: input.defaultEnabled ?? false,
      editionRules: input.editionRules ?? null,
    });
    return toFeatureFlagDto(created);
  }

  async setOverride(input: { featureFlagId: string; scopeType: 'ORGANIZATION' | 'WORKSPACE' | 'USER'; scopeId: string; enabled: boolean }): Promise<void> {
    const flag = await this.repository.findById(input.featureFlagId);
    if (!flag) {
      throw new AppException('FEATURE_FLAG_NOT_FOUND', `No feature flag with id "${input.featureFlagId}".`, HttpStatus.NOT_FOUND);
    }
    await this.repository.upsertOverride(input);
  }

  async evaluateAll(context: EvaluationContext): Promise<EvaluatedFeatureFlagsDto> {
    const flags = await this.repository.findAll();
    const scopes: { scopeType: 'ORGANIZATION' | 'WORKSPACE' | 'USER'; scopeId: string }[] = [{ scopeType: 'USER', scopeId: context.userId }];
    if (context.workspaceId) scopes.push({ scopeType: 'WORKSPACE', scopeId: context.workspaceId });
    if (context.organizationId) scopes.push({ scopeType: 'ORGANIZATION', scopeId: context.organizationId });
    const overrides = await this.repository.findOverridesForScopes(scopes);

    // Precompute anything an editionRules check might need, once, rather
    // than per-flag — cheap even when no flag actually uses the rule.
    const isEnterprise = await this.editionService.isEnterpriseFor(context.organizationId ?? null);
    const isSelfHosted = (await this.prisma.license.count()) === 0;
    const planTier = context.organizationId
      ? (await this.prisma.subscription.findUnique({ where: { organizationId: context.organizationId }, include: { plan: true } }).catch(() => null))?.plan.tier
      : undefined;

    const result: Record<string, boolean> = {};
    for (const flag of flags) {
      result[flag.key] = this.resolveOne(flag, overrides, { isEnterprise, isSelfHosted, planTier });
    }
    return { flags: result };
  }

  async isEnabled(key: string, context: EvaluationContext): Promise<boolean> {
    const { flags } = await this.evaluateAll(context);
    return flags[key] ?? false;
  }

  private resolveOne(
    flag: FeatureFlag,
    overrides: { featureFlagId: string; scopeType: string; scopeId: string; enabled: boolean }[],
    facts: { isEnterprise: boolean; isSelfHosted: boolean; planTier: string | undefined },
  ): boolean {
    const flagOverrides = overrides.filter((override) => override.featureFlagId === flag.id);
    const userOverride = flagOverrides.find((override) => override.scopeType === 'USER');
    if (userOverride) return userOverride.enabled;
    const workspaceOverride = flagOverrides.find((override) => override.scopeType === 'WORKSPACE');
    if (workspaceOverride) return workspaceOverride.enabled;
    const orgOverride = flagOverrides.find((override) => override.scopeType === 'ORGANIZATION');
    if (orgOverride) return orgOverride.enabled;

    const rules = flag.editionRules;
    if (rules) {
      if (rules.minEdition === 'enterprise' && !facts.isEnterprise) return false;
      if (rules.selfHostedOnly === true && !facts.isSelfHosted) return false;
      if (rules.selfHostedOnly === false && facts.isSelfHosted) return false;
      if (rules.planTiers && rules.planTiers.length > 0) {
        if (!facts.planTier || !rules.planTiers.includes(facts.planTier)) return false;
      }
      // `betaOnly`/`developerOnly` — no cohort concept exists on `User`
      // yet, so both are interpreted conservatively: a flag marked
      // `betaOnly`/`developerOnly` never turns on purely from
      // `defaultEnabled`, only from an explicit override (already
      // checked above) or, for `developerOnly`, a non-production
      // NODE_ENV. This is a deliberately narrow interpretation —
      // documented here rather than silently guessed at.
      if (rules.betaOnly === true) return false;
      if (rules.developerOnly === true && process.env.NODE_ENV === 'production') return false;
    }

    return flag.defaultEnabled;
  }
}
