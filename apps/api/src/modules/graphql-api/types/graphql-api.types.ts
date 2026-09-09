import { Field, GraphQLISODateTime, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
// Named import required (not default): under native Node ESM, a default
// import of this CJS package resolves to the whole `exports` object rather
// than the `GraphQLJSON` scalar itself (Node's CJS→ESM interop ignores the
// package's `__esModule` marker) — that wrapper object then isn't a valid
// GraphQL type, causing `CannotDetermineOutputTypeError` at schema-build
// time. Node's cjs-module-lexer detects the named `exports.GraphQLJSON = ...`
// assignment, so a named import binds correctly.
import { GraphQLJSON } from 'graphql-type-json';
import type {
  DistributedJobDto,
  DistributedJobPriority,
  DistributedJobStatus,
  OrganizationDto,
  OrganizationStatus,
  PluginCategory,
  PluginDto,
  PluginStatus,
  QueueMetricsDto,
} from '@pentesthub/shared';

/// Module 10 — GraphQL API v1 object types. Code-first (`@ObjectType`)
/// classes mirroring the existing REST DTO shapes 1:1 rather than
/// hand-writing a parallel SDL schema — kept deliberately thin (the
/// resolvers below call the exact same CommandBus/QueryBus + command/
/// query classes the REST controllers use, so there is exactly one
/// business-logic path per operation, GraphQL and REST are just two
/// transports over it). v1 scope covers the Enterprise Platform surface
/// (Organizations, Distributed Jobs, Plugin registry) rather than the
/// full REST API — see docs/adr/0010-enterprise-platform.md §API Platform
/// for the rationale (same "narrower, disclosed v1 scope" pattern as
/// Integrations OAuth and Plugin signature verification).

export enum OrganizationStatusGql {
  ACTIVE = 'ACTIVE',
  TRIAL = 'TRIAL',
  SUSPENDED = 'SUSPENDED',
  ARCHIVED = 'ARCHIVED',
}
registerEnumType(OrganizationStatusGql, { name: 'OrganizationStatus' });

export enum DistributedJobStatusGql {
  QUEUED = 'QUEUED',
  ASSIGNED = 'ASSIGNED',
  RUNNING = 'RUNNING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  RETRYING = 'RETRYING',
}
registerEnumType(DistributedJobStatusGql, { name: 'DistributedJobStatus' });

export enum DistributedJobPriorityGql {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}
registerEnumType(DistributedJobPriorityGql, { name: 'DistributedJobPriority' });

export enum PluginCategoryGql {
  RECON = 'RECON',
  SCANNERS = 'SCANNERS',
  AI_TOOLS = 'AI_TOOLS',
  REPORTING = 'REPORTING',
  INTEGRATIONS = 'INTEGRATIONS',
  DASHBOARDS = 'DASHBOARDS',
  UTILITIES = 'UTILITIES',
}
registerEnumType(PluginCategoryGql, { name: 'PluginCategory' });

export enum PluginStatusGql {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  DEPRECATED = 'DEPRECATED',
  SUSPENDED = 'SUSPENDED',
}
registerEnumType(PluginStatusGql, { name: 'PluginStatus' });

@ObjectType('Organization')
export class OrganizationGqlType implements OrganizationDto {
  @Field(() => ID) id!: string;
  @Field() name!: string;
  @Field() slug!: string;
  // Explicit `() => String` required on every nullable string field below:
  // GraphQL's reflection-based type inference can't determine a GraphQL
  // type from a TS union type (`string | null`) the way it can from a
  // plain `string` — first surfaced the first time the GraphQL schema was
  // actually built end-to-end.
  @Field(() => String, { nullable: true }) domain!: string | null;
  @Field(() => String, { nullable: true }) logoUrl!: string | null;
  @Field() plan!: string;
  @Field(() => OrganizationStatusGql) status!: OrganizationStatus;
  @Field() createdBy!: string;
  @Field(() => GraphQLISODateTime) createdAt!: string;
  @Field(() => GraphQLISODateTime) updatedAt!: string;
  // Module 14 -- Tenant Management (Enterprise Edition only) fields, added
  // to OrganizationDto after this GraphQL type was first written -- see
  // that interface's doc comment on why these are always present (never
  // undefined) but only ever non-default under EditionService.isEnterprise().
  @Field(() => String, { nullable: true }) billingEmail!: string | null;
  @Field(() => String, { nullable: true }) billingProviderCustomerId!: string | null;
  @Field(() => String, { nullable: true }) subscriptionStatus!: string | null;
  @Field(() => GraphQLISODateTime, { nullable: true }) subscriptionRenewsAt!: string | null;
  @Field(() => String, { nullable: true }) customDomain!: string | null;
  @Field(() => GraphQLISODateTime, { nullable: true }) customDomainVerifiedAt!: string | null;
  @Field(() => String, { nullable: true }) brandingPrimaryColor!: string | null;
  @Field(() => String, { nullable: true }) brandingFaviconUrl!: string | null;
}

@ObjectType('DistributedJob')
export class DistributedJobGqlType implements DistributedJobDto {
  @Field(() => ID) id!: string;
  @Field(() => String, { nullable: true }) organizationId!: string | null;
  @Field(() => String, { nullable: true }) workspaceId!: string | null;
  @Field() type!: string;
  @Field(() => GraphQLJSON) payload!: Record<string, unknown>;
  @Field(() => DistributedJobPriorityGql) priority!: DistributedJobPriority;
  @Field(() => DistributedJobStatusGql) status!: DistributedJobStatus;
  @Field(() => String, { nullable: true }) workerId!: string | null;
  @Field(() => Int) attempts!: number;
  @Field(() => Int) maxAttempts!: number;
  @Field(() => String, { nullable: true }) lastError!: string | null;
  @Field(() => GraphQLISODateTime, { nullable: true }) scheduledFor!: string | null;
  @Field(() => GraphQLISODateTime, { nullable: true }) startedAt!: string | null;
  @Field(() => GraphQLISODateTime, { nullable: true }) finishedAt!: string | null;
  @Field(() => GraphQLISODateTime) createdAt!: string;
  @Field(() => GraphQLISODateTime) updatedAt!: string;
}

@ObjectType('QueueMetrics')
export class QueueMetricsGqlType implements QueueMetricsDto {
  @Field(() => GraphQLJSON) byStatus!: Record<string, number>;
  @Field(() => GraphQLJSON) byPriority!: Record<string, number>;
  @Field(() => Int) onlineWorkers!: number;
  @Field(() => Int) totalCapacity!: number;
  @Field(() => Int) currentLoad!: number;
  @Field(() => Int, { nullable: true }) averageWaitMs!: number | null;
}

@ObjectType('Plugin')
export class PluginGqlType implements PluginDto {
  @Field(() => ID) id!: string;
  @Field(() => String, { nullable: true }) organizationId!: string | null;
  @Field() slug!: string;
  @Field() name!: string;
  @Field(() => PluginCategoryGql) category!: PluginCategory;
  @Field() description!: string;
  @Field() authorUserId!: string;
  @Field(() => PluginStatusGql) status!: PluginStatus;
  @Field(() => String, { nullable: true }) iconUrl!: string | null;
  @Field(() => String, { nullable: true }) homepageUrl!: string | null;
  @Field(() => String, { nullable: true }) repoUrl!: string | null;
  @Field(() => String, { nullable: true }) documentationMarkdown!: string | null;
  @Field() verified!: boolean;
  @Field(() => Int) downloadCount!: number;
  @Field() ratingAverage!: number;
  @Field(() => Int) ratingCount!: number;
  @Field(() => String, { nullable: true }) latestVersion!: string | null;
  @Field(() => GraphQLISODateTime) createdAt!: string;
  @Field(() => GraphQLISODateTime) updatedAt!: string;
}
