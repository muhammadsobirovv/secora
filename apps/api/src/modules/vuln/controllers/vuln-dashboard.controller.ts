import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { QueryBus } from '@nestjs/cqrs';
import type {
  VulnDashboardSummaryDto,
  VulnScannerHistoryEntryDto,
} from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { GetVulnDashboardSummaryQuery } from '../queries/get-vuln-dashboard-summary.query.js';
import { ListVulnScannerHistoryQuery } from '../queries/list-vuln-scanner-history.query.js';

/// The Vulnerability Dashboard page's two aggregate reads: the overall
/// summary (severity charts, scanner status, running jobs, recent
/// findings) and the standalone Scanner History page.
@ApiTags('vuln')
@ApiBearerAuth()
@Controller('vuln')
export class VulnDashboardController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Vulnerability dashboard summary' })
  summary(@CurrentUser() user: RequestUser): Promise<VulnDashboardSummaryDto> {
    return this.queryBus.execute(new GetVulnDashboardSummaryQuery(user.id));
  }

  @Get('scanners/history')
  @ApiOperation({ summary: 'Per-scanner run/finding history' })
  scannerHistory(
    @CurrentUser() user: RequestUser,
  ): Promise<VulnScannerHistoryEntryDto[]> {
    return this.queryBus.execute(new ListVulnScannerHistoryQuery(user.id));
  }
}
