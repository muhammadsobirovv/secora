import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { PluginChecksumDto, SecurityAdvisoryDto } from '@pentesthub/shared';
import { Roles } from '../../../common/decorators/roles.decorator.js';
import { PublishSecurityAdvisoryDto } from '../dto/marketplace-security.dto.js';
import { MarketplaceScannerService } from '../marketplace-scanner.service.js';
import { SecurityAdvisoryService } from '../security-advisory.service.js';

/// Module 15 — Marketplace security (task #333). Checksum lookup is
/// public read (any authenticated caller can verify a download);
/// publishing an advisory is a platform-operator action.
@ApiTags('marketplace-security')
@ApiBearerAuth()
@Controller('marketplace')
export class MarketplaceSecurityController {
  constructor(
    private readonly scanner: MarketplaceScannerService,
    private readonly advisories: SecurityAdvisoryService,
  ) {}

  @Get('plugin-versions/:pluginVersionId/checksum')
  @ApiOperation({ summary: 'Checksum, signature status, review status, and scan results for a plugin version' })
  getChecksum(@Param('pluginVersionId') pluginVersionId: string): Promise<PluginChecksumDto> {
    return this.scanner.getChecksum(pluginVersionId);
  }

  @Get('advisories')
  @ApiOperation({ summary: 'List all published security advisories' })
  list(): Promise<SecurityAdvisoryDto[]> {
    return this.advisories.list();
  }

  @Post('advisories')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Publish a security advisory (platform operator only)' })
  publish(@Body() dto: PublishSecurityAdvisoryDto): Promise<SecurityAdvisoryDto> {
    return this.advisories.publish(dto);
  }

  @Get('advisories/:id')
  @ApiOperation({ summary: 'Get one security advisory' })
  get(@Param('id') id: string): Promise<SecurityAdvisoryDto> {
    return this.advisories.get(id);
  }

  @Get('plugins/:pluginId/advisories')
  @ApiOperation({ summary: 'List security advisories for a specific plugin' })
  listForPlugin(@Param('pluginId') pluginId: string): Promise<SecurityAdvisoryDto[]> {
    return this.advisories.listForPlugin(pluginId);
  }
}
