import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { AppTransactionalAdapter } from '../../../../../prisma/prisma-transaction.types.js';
import type { RbacRepository } from '../../../domain/repositories/rbac.repository.interface.js';
import type { Role } from '../../../../../prisma-types.js';

@Injectable()
export class PrismaRbacRepository implements RbacRepository {
  constructor(
    private readonly txHost: TransactionHost<AppTransactionalAdapter>,
  ) {}

  findRoleByName(name: string): Promise<Role | null> {
    return this.txHost.tx.role.findUnique({ where: { name } });
  }

  async assignRoleToUser(userId: string, roleId: string): Promise<void> {
    await this.txHost.tx.userRole.create({ data: { userId, roleId } });
  }

  async findRoleNamesForUser(userId: string): Promise<string[]> {
    const userRoles = await this.txHost.tx.userRole.findMany({
      where: { userId },
      include: { role: true },
    });
    return userRoles.map((userRole) => userRole.role.name);
  }
}
