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
    const updated = await this.userPreferencesRepository.update(
      command.userId,
      command.data,
    );
    return toUserPreferencesDto(updated);
  }
}
