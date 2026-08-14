import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  BillingCheckoutSessionDto,
  BillingSummaryDto,
  CancelSubscriptionRequestDto,
  PlanDto,
  SubscriptionDto,
  UpgradeSubscriptionRequestDto,
} from '@pentesthub/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../../common/types/authenticated-request.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveOrganizationMembership } from '../../enterprise/organization-membership.util.js';
import { requireEnterpriseRole } from '../../enterprise/enterprise-permissions.util.js';
import { BillingService } from '../billing.service.js';
import { SubscriptionService } from '../subscription.service.js';

/// Module 15 — BillingController (task #331/#332). Plain-service pattern
/// (not CQRS `CommandBus`/`QueryBus`) — mirrors Module 14's
/// `BackupsController`, chosen for this whole billing module for
/// implementation speed (see `billing.service.ts`'s doc comment). Every
/// route is organization-explicit; reuses Module 10's
/// `resolveOrganizationMembership`/`requireEnterpriseRole` exactly as
/// `organizations.commands.ts` does — billing-mutating routes
/// (`upgrade`/`cancel`/`renew`) require `ADMIN`+ since a subscription
/// change has real financial consequences, while `getSummary` only
/// requires active membership (same bar `BackupsController` uses).
@ApiTags('billing')
@ApiBearerAuth()
@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly subscriptions: SubscriptionService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('plans')
  @ApiOperation({ summary: 'List active plans (Pricing page, Billing upgrade picker)' })
  listPlans(): Promise<PlanDto[]> {
    return this.billingService.listPlans();
  }

  @Get(':organizationId/summary')
  @ApiOperation({ summary: 'Billing summary — plan, usage, invoices, payment methods (/billing, /settings/billing)' })
  async getSummary(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<BillingSummaryDto> {
    await resolveOrganizationMembership(this.prisma, user.id, organizationId);
    return this.billingService.getSummary(organizationId);
  }

  @Post('upgrade')
  @ApiOperation({ summary: 'Change plan — applies immediately (NONE/MANUAL) or returns a hosted checkout URL (STRIPE)' })
  async upgrade(
    @Body() dto: UpgradeSubscriptionRequestDto,
    @CurrentUser() user: RequestUser,
  ): Promise<BillingCheckoutSessionDto> {
    const { role } = await resolveOrganizationMembership(this.prisma, user.id, dto.organizationId);
    requireEnterpriseRole(role, 'ADMIN');
    return this.subscriptions.upgrade(dto.organizationId, dto.planTier, dto.useHostedCheckout ?? true);
  }

  @Post('cancel')
  @ApiOperation({ summary: 'Cancel subscription — at period end (default) or immediately' })
  async cancel(
    @Body() dto: CancelSubscriptionRequestDto,
    @CurrentUser() user: RequestUser,
  ): Promise<SubscriptionDto> {
    const { role } = await resolveOrganizationMembership(this.prisma, user.id, dto.organizationId);
    requireEnterpriseRole(role, 'ADMIN');
    return this.subscriptions.cancel(dto.organizationId, dto.atPeriodEnd ?? true);
  }

  @Post(':organizationId/renew')
  @ApiOperation({ summary: 'Undo a pending cancel-at-period-end / reactivate a lapsed subscription' })
  async renew(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<SubscriptionDto> {
    const { role } = await resolveOrganizationMembership(this.prisma, user.id, organizationId);
    requireEnterpriseRole(role, 'ADMIN');
    return this.subscriptions.renew(organizationId);
  }
}
