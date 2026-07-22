import { UseGuards } from '@nestjs/common';
import { Args, ID, Query, Resolver } from '@nestjs/graphql';
import { QueryBus } from '@nestjs/cqrs';
import type { OrganizationDto } from '@pentesthub/shared';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard.js';
import { CurrentGqlUser } from '../../../common/decorators/current-gql-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { GetOrganizationQuery, ListMyOrganizationsQuery } from '../../enterprise/queries/organizations.query.js';
import { OrganizationGqlType } from '../types/graphql-api.types.js';

/// Delegates to the exact same `GetOrganizationQuery`/`ListMyOrganizationsQuery`
/// classes `OrganizationsController` (REST) dispatches — same
/// authorization (`resolveOrganizationMembership`), same data, GraphQL is
/// purely an additional transport.
@Resolver(() => OrganizationGqlType)
@UseGuards(JwtAuthGuard)
export class OrganizationResolver {
  constructor(private readonly queryBus: QueryBus) {}

  @Query(() => [OrganizationGqlType], { name: 'myOrganizations', description: 'Organizations the current user is an active member of' })
  myOrganizations(@CurrentGqlUser() user: RequestUser): Promise<OrganizationDto[]> {
    return this.queryBus.execute(new ListMyOrganizationsQuery(user.id));
  }

  @Query(() => OrganizationGqlType, { name: 'organization' })
  organization(@Args('id', { type: () => ID }) id: string, @CurrentGqlUser() user: RequestUser): Promise<OrganizationDto> {
    return this.queryBus.execute(new GetOrganizationQuery(user.id, id));
  }
}
