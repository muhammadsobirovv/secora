import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Throttle } from '@nestjs/throttler';
import type { PayloadLibraryEntryDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import {
  CreatePayloadLibraryEntryDto,
  ExplainPayloadDto,
  ListPayloadLibraryQueryParamsDto,
  UpdatePayloadLibraryEntryDto,
} from '../dto/payload-library.dto.js';
import {
  CreatePayloadLibraryEntryCommand,
  DeletePayloadLibraryEntryCommand,
  UpdatePayloadLibraryEntryCommand,
} from '../commands/payload-library.commands.js';
import { ExplainPayloadCommand } from '../commands/explain-payload.command.js';
import {
  GetPayloadLibraryEntryQuery,
  ListPayloadLibraryQuery,
} from '../queries/list-payload-library.query.js';

@ApiTags('bugbounty')
@ApiBearerAuth()
@Controller('bugbounty/payloads')
export class PayloadLibraryController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List payload library entries (seed + workspace custom)',
  })
  list(
    @Query() query: ListPayloadLibraryQueryParamsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<PayloadLibraryEntryDto[]> {
    return this.queryBus.execute(new ListPayloadLibraryQuery(user.id, query));
  }

  @Post()
  @ApiOperation({ summary: 'Create a custom payload library entry' })
  create(
    @Body() dto: CreatePayloadLibraryEntryDto,
    @CurrentUser() user: RequestUser,
  ): Promise<PayloadLibraryEntryDto> {
    return this.commandBus.execute(
      new CreatePayloadLibraryEntryCommand(user.id, dto),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a payload library entry' })
  get(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<PayloadLibraryEntryDto> {
    return this.queryBus.execute(new GetPayloadLibraryEntryQuery(user.id, id));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a custom payload library entry' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePayloadLibraryEntryDto,
    @CurrentUser() user: RequestUser,
  ): Promise<PayloadLibraryEntryDto> {
    return this.commandBus.execute(
      new UpdatePayloadLibraryEntryCommand(user.id, id, dto),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a custom payload library entry' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.commandBus.execute(
      new DeletePayloadLibraryEntryCommand(user.id, id),
    );
  }

  @Post(':id/explain')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'AI-explain how this payload works' })
  explain(
    @Param('id') id: string,
    @Body() dto: ExplainPayloadDto,
    @CurrentUser() user: RequestUser,
  ): Promise<PayloadLibraryEntryDto> {
    return this.commandBus.execute(new ExplainPayloadCommand(user.id, id, dto));
  }
}
