import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import type { Request } from 'express';
import type { EnvConfig } from '../../config/env.validation.js';
import { OrganizationResolver } from './resolvers/organization.resolver.js';
import { DistributedJobResolver } from './resolvers/distributed-job.resolver.js';
import { PluginResolver } from './resolvers/plugin.resolver.js';

/// Module 10 — GraphQL API. Code-first schema (`autoSchemaFile`, no
/// hand-maintained SDL — see graphql-api.types.ts's doc comment), Apollo
/// Server driver over the existing Express platform (`@nestjs/apollo`).
/// Auth reuses the same global `JwtAuthGuard`/`@CurrentGqlUser()` as every
/// other route (see that guard's GraphQL-context handling) — there is no
/// separate GraphQL auth system. Introspection/Playground are gated by
/// `GRAPHQL_PLAYGROUND_ENABLED` (env.validation.ts, default `false`) so a
/// production deployment doesn't expose its schema by default; the
/// endpoint itself (`POST /graphql`) is always live once this module is
/// imported, since disabling introspection doesn't disable execution.
@Module({
  imports: [
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      inject: [ConfigService],
      useFactory: (configService: ConfigService<EnvConfig, true>): ApolloDriverConfig => {
        const playgroundEnabled = configService.get('GRAPHQL_PLAYGROUND_ENABLED', { infer: true });
        return {
          autoSchemaFile: true,
          sortSchema: true,
          playground: false,
          introspection: playgroundEnabled,
          plugins: playgroundEnabled
            ? [
                // Apollo Sandbox (the modern replacement for the old GraphQL
                // Playground UI) is served automatically by @apollo/server
                // when introspection is on and no landing-page plugin is
                // otherwise configured — nothing further to wire here.
              ]
            : [],
          context: ({ req }: { req: Request }) => ({ req }),
        };
      },
    }),
  ],
  providers: [OrganizationResolver, DistributedJobResolver, PluginResolver],
})
export class GraphqlApiModule {}
