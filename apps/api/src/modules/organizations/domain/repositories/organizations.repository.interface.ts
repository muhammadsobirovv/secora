import type { Organization, OrgMemberRole } from '../../../../prisma-types.js';

export interface CreateOrganizationInput {
  name: string;
  slug: string;
}

/// Foundation only — invites, switching, multi-member workflows are future-
/// module work. This sprint only creates a personal Organization at
/// register time (see decision 8, docs/adr/0001-auth-module.md).
export interface OrganizationsRepository {
  create(input: CreateOrganizationInput): Promise<Organization>;
  addMember(
    organizationId: string,
    userId: string,
    role: OrgMemberRole,
  ): Promise<void>;
}

export const ORGANIZATIONS_REPOSITORY = Symbol('ORGANIZATIONS_REPOSITORY');
