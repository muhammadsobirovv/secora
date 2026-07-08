import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { EvidenceDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { UpdateEvidenceDto } from '../dto/update-evidence.dto.js';
import {
  UpdateEvidenceCommand,
  DeleteEvidenceCommand,
} from '../commands/evidence-lifecycle.commands.js';
import { GetEvidenceQuery } from '../queries/evidence.queries.js';

@ApiTags('evidence')
@ApiBearerAuth()
@Controller('evidence')
export class EvidenceController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get(':evidenceId')
  @ApiOperation({ summary: 'Get a piece of evidence' })
  get(
    @Param('evidenceId') evidenceId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<EvidenceDto> {
    return this.queryBus.execute(new GetEvidenceQuery(user.id, evidenceId));
  }

  @Patch(':evidenceId')
  @ApiOperation({ summary: 'Update evidence metadata' })
  update(
    @Param('evidenceId') evidenceId: string,
    @Body() dto: UpdateEvidenceDto,
    @CurrentUser() user: RequestUser,
  ): Promise<EvidenceDto> {
    return this.commandBus.execute(
      new UpdateEvidenceCommand(user.id, evidenceId, dto),
    );
  }

  @Delete(':evidenceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete evidence' })
  delete(
    @Param('evidenceId') evidenceId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    return this.commandBus.execute(
      new DeleteEvidenceCommand(user.id, evidenceId),
    );
  }
}
