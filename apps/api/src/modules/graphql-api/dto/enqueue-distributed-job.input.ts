import { Field, InputType, Int } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';
import type { EnqueueDistributedJobRequestDto } from '@pentesthub/shared';
import { DistributedJobPriorityGql } from '../types/graphql-api.types.js';

@InputType('EnqueueDistributedJobInput')
export class EnqueueDistributedJobInput implements EnqueueDistributedJobRequestDto {
  @Field() type!: string;
  @Field(() => GraphQLJSON) payload!: Record<string, unknown>;
  @Field(() => DistributedJobPriorityGql, { nullable: true }) priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
  @Field(() => Int, { nullable: true }) maxAttempts?: number;
  @Field({ nullable: true }) scheduledFor?: string;
  @Field({ nullable: true }) workspaceId?: string;
}
