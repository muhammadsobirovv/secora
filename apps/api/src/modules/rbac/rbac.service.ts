import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  RBAC_REPOSITORY,
  type RbacRepository,
} from './domain/repositories/rbac.repository.interface.js';
import { DEFAULT_ROLE_NAMES } from './constants.js';

/// Application-layer service used by register (assign default role) and
/// login/JWT-issuance (resolve role names for the access token's `roles`
/// claim). No route is gated by role yet — see decision 8,
/// docs/adr/0001-auth-module.md.
@Injectable()
export class RbacService {
  constructor(
    @Inject(RBAC_REPOSITORY) private readonly rbacRepository: RbacRepository,
  ) {}

  async assignDefaultRole(userId: string): Promise<void> {
    const role = await this.rbacRepository.findRoleByName(
      DEFAULT_ROLE_NAMES.USER,
    );
    if (!role) {
      throw new InternalServerErrorException(
        `Default role "${DEFAULT_ROLE_NAMES.USER}" is not seeded — run prisma db seed`,
      );
    }
    await this.rbacRepository.assignRoleToUser(userId, role.id);
  }

  getRoleNamesForUser(userId: string): Promise<string[]> {
    return this.rbacRepository.findRoleNamesForUser(userId);
  }
}
