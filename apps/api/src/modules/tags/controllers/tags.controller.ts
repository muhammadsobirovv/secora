import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { TagDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { CreateTagDto } from '../dto/create-tag.dto.js';
import {
  CreateTagCommand,
  DeleteTagCommand,
} from '../commands/tag.commands.js';
import { ListTagsQuery } from '../queries/list-tags.query.js';

@ApiTags('tags')
@ApiBearerAuth()
@Controller('tags')
export class TagsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List workspace tags' })
  list(@CurrentUser() user: RequestUser): Promise<TagDto[]> {
    return this.queryBus.execute(new ListTagsQuery(user.id));
  }

  @Post()
  @ApiOperation({ summary: 'Create a tag' })
  create(
    @Body() dto: CreateTagDto,
    @CurrentUser() user: RequestUser,
  ): Promise<TagDto> {
    return this.commandBus.execute(new CreateTagCommand(user.id, dto));
  }

  @Delete(':tagId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a tag' })
  delete(
    @Param('tagId') tagId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    return this.commandBus.execute(new DeleteTagCommand(user.id, tagId));
  }
}
