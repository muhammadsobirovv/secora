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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { TargetDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { UpdateTargetDto } from '../dto/update-target.dto.js';
import {
  UpdateTargetCommand,
  DeleteTargetCommand,
} from '../commands/target-lifecycle.commands.js';
import {
  TagTargetCommand,
  UntagTargetCommand,
} from '../commands/target-tags.commands.js';
import { GetTargetQuery } from '../queries/target.queries.js';

/// Flat /targets/:targetId routes — target ids are globally unique
/// UUIDs, so no projectId is needed from the client here (resolved
/// internally from the target itself). List/create live on
/// ProjectTargetsController, nested under /projects/:projectId/targets,
/// since a target can only be created within a specific project.
@ApiTags('targets')
@ApiBearerAuth()
@Controller('targets')
export class TargetsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get(':targetId')
  @ApiOperation({ summary: 'Get a target' })
  get(
    @Param('targetId') targetId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<TargetDto> {
    return this.queryBus.execute(new GetTargetQuery(user.id, targetId));
  }

  @Patch(':targetId')
  @ApiOperation({ summary: 'Update a target' })
  update(
    @Param('targetId') targetId: string,
    @Body() dto: UpdateTargetDto,
    @CurrentUser() user: RequestUser,
  ): Promise<TargetDto> {
    return this.commandBus.execute(
      new UpdateTargetCommand(user.id, targetId, dto),
    );
  }

  @Delete(':targetId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a target' })
  delete(
    @Param('targetId') targetId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    return this.commandBus.execute(new DeleteTargetCommand(user.id, targetId));
  }

  @Post(':targetId/tags/:tagId')
  @ApiOperation({ summary: 'Tag a target' })
  tag(
    @Param('targetId') targetId: string,
    @Param('tagId') tagId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    return this.commandBus.execute(
      new TagTargetCommand(user.id, targetId, tagId),
    );
  }

  @Delete(':targetId/tags/:tagId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Untag a target' })
  untag(
    @Param('targetId') targetId: string,
    @Param('tagId') tagId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    return this.commandBus.execute(
      new UntagTargetCommand(user.id, targetId, tagId),
    );
  }
}
