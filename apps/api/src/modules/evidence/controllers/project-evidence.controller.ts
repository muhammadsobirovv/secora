import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { EvidenceDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { CreateEvidenceDto } from '../dto/create-evidence.dto.js';
import { CreateEvidenceCommand } from '../commands/create-evidence.command.js';
import { ListEvidenceQuery } from '../queries/evidence.queries.js';

@ApiTags('evidence')
@ApiBearerAuth()
@Controller('projects/:projectId/evidence')
export class ProjectEvidenceController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List evidence in a project' })
  list(
    @Param('projectId') projectId: string,
    @Query('targetId') targetId: string | undefined,
    @CurrentUser() user: RequestUser,
  ): Promise<EvidenceDto[]> {
    return this.queryBus.execute(
      new ListEvidenceQuery(user.id, projectId, targetId),
    );
  }

  @Post()
  @ApiOperation({ summary: 'Create evidence in a project' })
  create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateEvidenceDto,
    @CurrentUser() user: RequestUser,
  ): Promise<EvidenceDto> {
    return this.commandBus.execute(
      new CreateEvidenceCommand(user.id, projectId, dto),
    );
  }
}
