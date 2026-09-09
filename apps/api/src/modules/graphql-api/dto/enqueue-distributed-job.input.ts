import { Field, InputType, Int } from '@nestjs/graphql';
// Named import required — see graphql-api.types.ts for why (default import
// of this CJS package under native Node ESM resolves to the whole `exports`
// object, not the scalar).
import { GraphQLJSON } from 'graphql-type-json';
import type { EnqueueDistributedJobRequestDto } from '@pentesthub/shared';
import { DistributedJobPriorityGql } from '../types/graphql-api.types.js';

@InputType('EnqueueDistributedJobInput')
export class EnqueueDistributedJobInput implements EnqueueDistributedJobRequestDto {
  @Field() type!: string;
  @Field(() => GraphQLJSON) payload!: Record<string, unknown>;
  @Field(() => DistributedJobPriorityGql, { nullable: true }) priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
  @Field(() => Int, { nullable: true }) maxAttempts?: number;
  // Explicit `() => String` required — see graphql-api.types.ts for why
  // (GraphQL reflection can't infer a type from an optional/union TS type).
  @Field(() => String, { nullable: true }) scheduledFor?: string;
  @Field(() => String, { nullable: true }) workspaceId?: string;
}
