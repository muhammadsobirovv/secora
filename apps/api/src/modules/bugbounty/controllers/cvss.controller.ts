import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { QueryBus } from '@nestjs/cqrs';
import type { CalculateCvssResultDto } from '@pentesthub/shared';
import { CalculateCvssDto } from '../dto/cvss.dto.js';
import { CalculateCvssQuery } from '../queries/calculate-cvss.query.js';

/// Module 9's standalone CVSS 3.1 calculator — `/bugbounty/cvss/calculate`
/// per CVSS_ENDPOINTS in @pentesthub/shared. Deliberately its own
/// controller (not folded into BugBountyFindingsController) since scoring
/// a vector has nothing to do with a specific finding id; the frontend
/// calculator widget calls this to score-as-you-type, then the resulting
/// score/vector get attached to a finding via the normal create/update
/// endpoints.
@ApiTags('bugbounty')
@ApiBearerAuth()
@Controller('bugbounty/cvss')
export class CvssController {
  constructor(private readonly queryBus: QueryBus) {}

  @Post('calculate')
  @ApiOperation({ summary: 'Calculate a CVSS 3.1 base score from its vector components' })
  calculate(@Body() dto: CalculateCvssDto): Promise<CalculateCvssResultDto> {
    return this.queryBus.execute(new CalculateCvssQuery(dto));
  }
}
