import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { MarketplacePublisherDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { Roles } from '../../../common/decorators/roles.decorator.js';
import { RegisterMarketplacePublisherDto } from '../dto/marketplace-security.dto.js';
import { MarketplacePublisherService } from '../marketplace-publisher.service.js';

/// Module 15 — Marketplace security (task #333).
@ApiTags('marketplace-security')
@ApiBearerAuth()
@Controller('marketplace/publishers')
export class MarketplacePublisherController {
  constructor(private readonly publishers: MarketplacePublisherService) {}

  @Post()
  @ApiOperation({ summary: 'Register a marketplace publisher profile for the current user' })
  register(@Body() dto: RegisterMarketplacePublisherDto, @CurrentUser() user: RequestUser): Promise<MarketplacePublisherDto> {
    return this.publishers.register(user.id, dto);
  }

  @Get('me')
  @ApiOperation({ summary: "Get the current user's publisher profile" })
  getMine(@CurrentUser() user: RequestUser): Promise<MarketplacePublisherDto> {
    return this.publishers.getMine(user.id);
  }

  @Post(':id/verify')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Grant the "Verified" marketplace badge to a publisher (platform operator only)' })
  verify(@Param('id') id: string): Promise<MarketplacePublisherDto> {
    return this.publishers.verify(id);
  }
}
