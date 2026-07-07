import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type {
  CreateOrganizationInput,
  OrganizationsRepository,
} from '../../../domain/repositories/organizations.repository.interface.js';
import type {
  Organization,
  OrgMemberRole,
} from '../../../../../prisma-types.js';

@Injectable()
export class PrismaOrganizationsRepository implements OrganizationsRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  create(input: CreateOrganizationInput): Promise<Organization> {
    return this.txHost.tx.organization.create({ data: input });
  }

  async addMember(
    organizationId: string,
    userId: string,
    role: OrgMemberRole,
  ): Promise<void> {
    await this.txHost.tx.organizationMember.create({
      data: { organizationId, userId, role },
    });
  }
}
