import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ApiVersionInfoDto } from '@pentesthub/shared';
import { CURRENT_API_VERSION, SUPPORTED_API_VERSIONS } from '@pentesthub/shared';

/// Module 15 — Public API v1 versioning layer (task #335). Machine-
/// readable discovery endpoint — an SDK/integration can call this once
/// at startup to confirm which versions the target deployment supports
/// before sending `X-API-Version` on subsequent requests.
@ApiTags('public-api')
@Controller('public-api/version')
export class ApiVersionController {
  @Get()
  @ApiOperation({ summary: 'Supported/current/deprecated API versions' })
  get(): ApiVersionInfoDto {
    return {
      currentVersion: CURRENT_API_VERSION,
      supportedVersions: [...SUPPORTED_API_VERSIONS],
      deprecatedVersions: [],
    };
  }
}
