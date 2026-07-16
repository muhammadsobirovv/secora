import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { QueryBus } from '@nestjs/cqrs';
import type { AssetInventoryEntryDto } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { AssetInventoryQueryParamsDto } from '../dto/asset-inventory.dto.js';
import { ListAssetInventoryQuery } from '../queries/list-asset-inventory.query.js';

@ApiTags('bugbounty')
@ApiBearerAuth()
@Controller('bugbounty/assets')
export class BugBountyAssetsController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @ApiOperation({
    summary:
      'Asset Inventory — targets aggregated with recon/vuln/notes/evidence data',
  })
  list(
    @Query() query: AssetInventoryQueryParamsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<AssetInventoryEntryDto[]> {
    return this.queryBus.execute(new ListAssetInventoryQuery(user.id, qu