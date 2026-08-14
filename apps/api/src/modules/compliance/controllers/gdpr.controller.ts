import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { QueryBus } from '@nestjs/cqrs';
import type { GdprOverviewDto } from '@pentesthub/shared';
import { GetGdprOverviewQuery } from '../queries/gdpr-overview.query.js';

/// Module 15 — task #343 "GDPR-ready foundation". Unlike the rest of the
/// Compliance module (org-scoped, Admin+ gated — see compliance.controller.ts),
/// this is a static reference endpoint: any authenticated user can read it,
/// there's nothing org-specific or sensitive in the response.
@ApiTags('compliance')
@ApiBearerAuth()
@Controller('compliance/gdpr')
export class GdprController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('overview')
  @ApiOperation({
    summary:
      'Data processing register, data subject rights, and breach/cross-border-transfer notes (GDPR-readiness reference)',
  })
  overview(): Promise<GdprOverviewDto> {
    return this.queryBus.execute(new GetGdprOverviewQuery());
  }
}
