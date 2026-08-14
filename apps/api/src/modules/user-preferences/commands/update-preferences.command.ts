import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import type {
  UpdateUserPreferencesRequestDto,
  UserPreferencesDto,
} from '@pentesthub/shared';
import {
  USER_PREFERENCES_REPOSITORY,
  type UserPreferencesRepository,
} from '../domain/repositories/user-preferences.repository.interface.js';
import { toUserPreferencesDto } from '../mappers/to-preferences-dto.mapper.js';

export class UpdatePreferencesCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly data: UpdateUserPreferencesRequestDto,
  ) {}
}

@CommandHandler(UpdatePreferencesCommand)
export class UpdatePreferencesHandler implements ICommandHandler<
  UpdatePreferencesCommand,
  UserPreferencesDto
> {
  constructor(
    @Inject(USER_PREFERENCES_REPOSITORY)
    private readonly userPreferencesRepository: UserPreferencesRepository,
  ) {}

  async execute(
    command: UpdatePreferencesCommand,
  ): Promise<UserPreferencesDto> {
    // Module 15 — task #351. Translate the wire-level boolean into the
    // domain-level timestamp here, at the command boundary, rather than
    // pushing `Date.now()` down into the repository (keeps the repository
    // a dumb persistence layer and the "what does completing onboarding
    // mean" decision in one place). `onboardingCompleted` itself is never
    // forwarded — only the derived timestamp is, so a stray boolean field
    // can't leak into the Prisma `update` payload.
    const { onboardingCompleted, ...rest } = command.data;
    const updated = await this.userPreferencesRepository.update(command.userId, {
      ...rest,
      ...(onboardingCompleted ? { onboardingCompletedAt: new Date() } : {}),
    });
    return toUserPreferencesDto(updated);
  }
}
