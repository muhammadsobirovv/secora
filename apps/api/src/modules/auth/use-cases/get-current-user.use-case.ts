import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUserDto } from '@pentesthub/shared';
import {
  USERS_REPOSITORY,
  type UsersRepository,
} from '../domain/repositories/users.repository.interface.js';
import {
  MFA_REPOSITORY,
  type MfaRepository,
} from '../domain/repositories/mfa.repository.interface.js';
import { toAuthenticatedUserDto } from '../mappers/to-authenticated-user-dto.mapper.js';

@Injectable()
export class GetCurrentUserUseCase {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly usersRepository: UsersRepository,
    @Inject(MFA_REPOSITORY) private readonly mfaRepository: MfaRepository,
  ) {}

  async execute(userId: string): Promise<AuthenticatedUserDto> {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    const mfaFactor = await this.mfaRepository.findFactorByUserId(userId);
    return toAuthenticatedUserDto(user, Boolean(mfaFactor?.enabled));
  }
}
