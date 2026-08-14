import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { EvaluatedFeatureFlagsDto, FeatureFlagDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { FeatureFlagsService } from '../feature-flags.service.js';
import { CreateFeatureFlagDto } from '../dto/create-feature-flag.dto.js';
import { SetFeatureFlagOverrideDto } from '../dto/set-feature-flag-override.dto.js';

/// Module 15 — task #357. `list()`/`create()`/`setOverride()` are
/// management operations with no dedicated authorization check beyond
/// "authenticated" — this codebase has no deployment-wide platform-admin
/// role (the same gap already disclosed for `ClusterOverviewService`,
/// Module 14, and the Support ticket queue, task #355). A production
/// deployment should restrict these three routes at the network layer
/// (internal-only route / reverse-proxy allowlist) until such a role
/// exists; the flags/overrides tables themselves are the source of
/// truth either way, so this is a triage-access gap, not a data-model
/// one. `evaluate()` is intentionally open to any authenticated user —
/// it only ever returns the caller's own resolved flag values.
@ApiTags('feature-flags')
@ApiBearerAuth()
@Controller('feature-flags')
export class FeatureFlagsController {
  constructor(private readonly featureFlags: FeatureFlagsService) {}

  @Get()
  @ApiOperation({ summary: 'List every feature flag definition' })
  list(): Promise<FeatureFlagDto[]> {
    return this.featureFlags.list();
  }

  @Post()
  @ApiOperation({ summary: 'Create a new feature flag' })
  create(@Body() dto: CreateFeatureFlagDto): Promise<FeatureFlagDto> {
    return this.featureFlags.create(dto);
  }

  @Post('overrides')
  @ApiOperation({ summary: 'Set (or replace) a per-scope override for a flag' })
  async setOverride(@Body() dto: SetFeatureFlagOverrideDto): Promise<{ ok: true }> {
    await this.featureFlags.setOverride(dto);
    return { ok: true };
  }

  @Get('evaluate')
  @ApiOperation({ summary: "Resolve every flag's value for the calling user (optionally scoped to a workspace/organization)" })
  evaluate(
    @CurrentUser() user: RequestUser,
    @Query('workspaceId') workspaceId?: string,
    @Query('organizationId') organizationId?: string,
  ): Promise<EvaluatedFeatureFlagsDto> {
    return this.featureFlags.evaluateAll({ userId: user.id, workspaceId, organizationId });
  }
}
