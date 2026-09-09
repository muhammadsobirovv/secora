import { UseGuards } from '@nestjs/common';
import { Args, Query, Resolver } from '@nestjs/graphql';
import { QueryBus } from '@nestjs/cqrs';
import type { PluginCategory, PluginDto, PluginStatus } from '@pentesthub/shared';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.js';
import { ListPluginsQuery } from '../../plugins/queries/plugins.query.js';
import { PluginCategoryGql, PluginGqlType, PluginStatusGql } from '../types/graphql-api.types.js';

/// Delegates to the same `ListPluginsQuery` the REST `/plugins` catalog
/// endpoint dispatches — the shared marketplace catalog, not org-scoped
/// (see PluginsController's doc comment).
@Resolver(() => PluginGqlType)
@UseGuards(JwtAuthGuard)
export class PluginResolver {
  constructor(private readonly queryBus: QueryBus) {}

  @Query(() => [PluginGqlType], { name: 'plugins' })
  plugins(
    @Args('category', { type: () => PluginCategoryGql, nullable: true }) category: PluginCategory | undefined,
    @Args('status', { type: () => PluginStatusGql, nullable: true }) status: PluginStatus | undefined,
    // Explicit `type: () => String` required — see distributed-job.resolver.ts
    // for why: GraphQL's reflection-based type inference can't determine a
    // GraphQL type from a TS union type (`string | undefined`).
    @Args('search', { type: () => String, nullable: true }) search: string | undefined,
  ): Promise<PluginDto[]> {
    return this.queryBus.execute(new ListPluginsQuery({ category, status, search }));
  }
}
