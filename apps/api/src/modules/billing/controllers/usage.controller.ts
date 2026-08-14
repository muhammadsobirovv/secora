import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { PlanUsageSummaryEntry } from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveOrganizationMembership } from '../../enterprise/organization-membership.util.js';
import { QuotaService } from '../quota.service.js';

/// Module 15 — UsageController (task #331/#332). Read-only — any active
/// organization member can see how much of the plan's quota has been
/// consumed (the same bar `BillingController.getSummary` uses); writing
/// usage counters is never exposed over HTTP — `UsageService.record()` is
/// called internally by whichever module actually performs the metered
/// action (AI chat, scan/recon completion, report generation, etc.), not
/// by a client-facing endpoint a caller could use to fabricate usage.
@ApiTags('usage')
@ApiBearerAuth()
@Controller('usage')
export class UsageController {
  constructor(
    private readonly quotaService: QuotaService,
    private readonly prisma: PrismaService,
  ) {}

  @Get(':organizationId/summary')
  @ApiOperation({ summary: 'Current-period usage against the organization plan\'s limits (Billing page usage bars)' })
  async getSummary(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<PlanUsageSummaryEntry[]> {
    await resolveOrganizationMembership(this.prisma, user.id, organizationId);
    return this.quotaService.getPlanUsageSummary(organizationId);
  }
}
