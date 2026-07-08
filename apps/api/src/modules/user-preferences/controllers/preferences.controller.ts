import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { UserPreferencesDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { UpdatePreferencesDto } from '../dto/update-preferences.dto.js';
import { UpdatePreferencesCommand } from '../commands/update-preferences.command.js';
import { GetPreferencesQuery } from '../queries/get-preferences.query.js';

@ApiTags('user-preferences')
@ApiBearerAuth()
@Controller('users/me/preferences')
export class PreferencesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: "Get the current user's preferences" })
  get(@CurrentUser() user: RequestUser): Promise<UserPreferencesDto> {
    return this.queryBus.execute(new GetPreferencesQuery(user.id));
  }

  @Patch()
  @ApiOperation({ summary: "Update the current user's preferences" })
  update(
    @Body() dto: UpdatePreferencesDto,
    @CurrentUser() user: RequestUser,
  ): Promise<UserPreferencesDto> {
    return this.commandBus.execute(new UpdatePreferencesCommand(user.id, dto));
  }
}
