import type { Role } from '../../../../prisma-types.js';

export interface RbacRepository {
  findRoleByName(name: string): Promise<Role | null>;
  assignRoleToUser(userId: string, roleId: string): Promise<void>;
  findRoleNamesForUser(userId: string): Promise<string[]>;
}

export const RBAC_REPOSITORY = Symbol('RBAC_REPOSITORY');
