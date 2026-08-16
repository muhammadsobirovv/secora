import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import type { ShareLinkDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { CreateShareLinkDto } from '../dto/sharing.dto.js';
import { CreateShareLinkCommand, RevokeShareLinkCommand } from '../commands/share-links.commands.js';
import { ListShareLinksQuery } from '../queries/share-links.query.js';

class ListShareLinksQueryParamsDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() workspaceId?: string;
}

/// Authenticated workspace-member surface for managing share links —
/// distinct from PublicShareController below, which is what the
/// recipient of a link actually hits. No `:workspaceId` path segment
/// (matches `SHARE_LINK_ENDPOINTS` in packages/shared): the workspace is
/// always derived from the resource/link itself server-side, never
/// accepted as an authorization input from the client (see
/// share-links.commands.ts's doc comments).
@ApiTags('sharing')
@ApiBearerAuth()
@Controller('share-links')
export class ShareLinksController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List share links (optionally filtered to one workspace you belong to)' })
  list(
    @Query() query: ListShareLinksQueryParamsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ShareLinkDto[]> {
    return this.queryBus.execute(new ListShareLinksQuery(user.id, query.workspaceId));
  }

  @Post()
  @ApiOperation({ summary: 'Create a share link for a Report/Finding/Evidence/Dashboard/Project you can access' })
  create(@Body() dto: CreateShareLinkDto, @CurrentUser() user: RequestUser): Promise<ShareLinkDto> {
    return this.commandBus.execute(new CreateShareLinkCommand(user.id, dto));
  }

  @Post(':id/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a share link immediately' })
  async revoke(@Param('id') id: string, @CurrentUser() user: RequestUser): Promise<void> {
    await this.commandBus.execute(new RevokeShareLinkCommand(user.id, id));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Alias for revoke (DELETE semantics)' })
  async remove(@Param('id') id: string, @CurrentUser() user: RequestUser): Promise<void> {
    await this.commandBus.execute(new RevokeShareLinkCommand(user.id, id));
  }
}
