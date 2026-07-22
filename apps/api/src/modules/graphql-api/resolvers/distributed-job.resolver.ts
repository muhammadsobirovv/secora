import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { DistributedJobDto, QueueMetricsDto } from '@pentesthub/shared';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.js';
import { CurrentGqlUser } from '../../../common/decorators/current-gql-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { ListDistributedJobsQuery, GetQueueMetricsQuery } from '../../distributed-jobs/queries/distributed-jobs.query.js';
import { EnqueueDistributedJobCommand } from '../../distributed-jobs/commands/distributed-jobs.commands.js';
import { DistributedJobGqlType, DistributedJobStatusGql, QueueMetricsGqlType } from '../types/graphql-api.types.js';
import { EnqueueDistributedJobInput } from '../dto/enqueue-distributed-job.input.js';

/// Delegates to the same `ListDistributedJobsQuery`/`GetQueueMetricsQuery`/
/// `EnqueueDistributedJobCommand` classes the REST Distributed Job System
/// controllers dispatch (worker-facing claim/complete/fail routes stay
/// REST-only via `ApiKeyAuthGuard` — those are machine endpoints, not a
/// natural fit for a JWT-authenticated GraphQL API).
@Resolver(() => DistributedJobGqlType)
@UseGuards(JwtAuthGuard)
export class DistributedJobResolver {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  @Query(() => [DistributedJobGqlType], { name: 'distributedJobs' })
  jobs(
    @Args('organizationId', { type: () => ID }) organizationId: string,
    @Args('status', { type: () => DistributedJobStatusGql, nullable: true }) status: DistributedJobDto['status'] | undefined,
    @Args('type', { nullable: true }) type: string | undefined,
    @CurrentGqlUser() user: RequestUser,
  ): Promise<DistributedJobDto[]> {
    return this.queryBus.execute(new ListDistributedJobsQuery(user.id, organizationId, { status, type }));
  }

  @Query(() => QueueMetricsGqlType, { name: 'queueMetrics' })
  queueMetrics(@Args('organizationId', { type: () => ID }) organizationId: string, @CurrentGqlUser() user: RequestUser): Promise<QueueMetricsDto> {
    return this.queryBus.execute(new GetQueueMetricsQuery(user.id, organizationId));
  }

  @Mutation(() => DistributedJobGqlType, { name: 'enqueueDistributedJob' })
  enqueue(
    @Args('organizationId', { type: () => ID }) organizationId: string,
    @Args('input') input: EnqueueDistributedJobInput,
    @CurrentGqlUser() user: RequestUser,
  ): Promise<DistributedJobDto> {
    return this.commandBus.execute(new EnqueueDistributedJobCommand(user.id, organizationId, input));
  }
}
