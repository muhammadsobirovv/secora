import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject, HttpStatus } from '@nestjs/common';
import type { UserPreferencesDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  USER_PREFERENCES_REPOSITORY,
  type UserPreferencesRepository,
} from '../domain/repositories/user-preferences.repository.interface.js';
import { toUserPreferencesDto } from '../mappers/to-preferences-dto.mapper.js';

export class GetPreferencesQuery implements IQuery {
  constructor(public readonly userId: string) {}
}

@QueryHandler(GetPreferencesQuery)
export class GetPreferencesHandler implements IQueryHandler<
  GetPreferencesQuery,
  UserPreferencesDto
> {
  constructor(
    @Inject(USER_PREFERENCES_REPOSITORY)
    private readonly userPreferencesRepository: UserPreferencesRepository,
  ) {}

  async execute(query: GetPreferencesQuery): Promise<UserPreferencesDto> {
    const prefs = await this.userPreferencesRepository.findByUserId(
      query.userId,
    );
    if (!prefs) {
      throw new AppException(
        'PREFERENCES_NOT_FOUND',
        'Preferences not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    return toUserPreferencesDto(prefs);
  }
}
