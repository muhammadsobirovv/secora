import { Field, GraphQLISODateTime, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';
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
  @Field({ nullable: true }) domain!: string | null;
  @Field({ nullable: true }) logoUrl!: string | null;
  @Field() plan!: string;
  @Field(() => OrganizationStatusGql) status!: OrganizationStatus;
  @Field() createdBy!: string;
  @Field(() => GraphQLISODateTime) createdAt!: string;
  @Field(() => GraphQLISODateTime) updatedAt!: string;
}

@ObjectType('DistributedJob')
export class DistributedJobGqlType implements DistributedJobDto {
  @Field(() => ID) id!: string;
  @Field({ nullable: true }) organizationId!: string | null;
  @Field({ nullable: true }) workspaceId!: string | null;
  @Field() type!: string;
  @Field(() => GraphQLJSON) payload!: Record<string, unknown>;
  @Field(() => DistributedJobPriorityGql) priority!: DistributedJobPriority;
  @Field(() => DistributedJobStatusGql) status!: DistributedJobStatus;
  @Field({ nullable: true }) workerId!: string | null;
  @Field(() => Int) attempts!: number;
  @Field(() => Int) maxAttempts!: number;
  @Field({ nullable: true }) lastError!: string | null;
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
  @Field({ nullable: true }) organizationId!: string | null;
  @Field() slug!: string;
  @Field() name!: string;
  @Field(() => PluginCategoryGql) category!: PluginCategory;
  @Field() description!: string;
  @Field() authorUserId!: string;
  @Field(() => PluginStatusGql) status!: PluginStatus;
  @Field({ nullable: true }) iconUrl!: string | null;
  @Field({ nullable: true }) homepageUrl!: string | null;
  @Field({ nullable: true }) repoUrl!: string | null;
  @Field({ nullable: true }) documentationMarkdown!: string | null;
  @Field() verified!: boolean;
  @Field(() => Int) downloadCount!: number;
  @Field() ratingAverage!: number;
  @Field(() => Int) ratingCount!: number;
  @Field({ nullable: true }) latestVersion!: string | null;
  @Field(() => GraphQLISODateTime) createdAt!: string;
  @Field(() => GraphQLISODateTime) updatedAt!: string;
}
