import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../config/env.validation.js';
import { PAYMENT_PROVIDER } from '../../common/providers/tokens.js';
import { NullPaymentProvider } from './providers/null-payment-provider.js';
import { ManualPaymentProvider } from './providers/manual-payment-provider.js';
import { StripePaymentProvider } from './providers/stripe-payment-provider.js';
import { SubscriptionService } from './subscription.service.js';
import { UsageService } from './usage.service.js';
import { QuotaService } from './quota.service.js';
import { AiModelPricingService } from './ai-cost/ai-model-pricing.service.js';
import { AiBudgetEnforcerService } from './ai-cost/ai-budget-enforcer.service.js';
import { NotificationsChannelsCoreModule } from '../notifications-channels/notifications-channels-core.module.js';

/// Module 15 — AI cost control (task #340) split this out of the full
/// `BillingModule` for the same reason `VulnCoreModule`/`ReconCoreModule`/
/// `BugBountyCoreModule`/`NotificationsChannelsCoreModule` exist: the
/// worker process's root module (worker.module.ts) imports `AiCoreModule`,
/// which now needs `AiBudgetEnforcerService` for `AiChatService` — and
/// worker.module.ts's own doc comment is explicit that no HTTP
/// controllers belong in that process's DI graph (no guards, no HTTP
/// server at all). This module holds exactly the providers
/// `AiBudgetEnforcerService` needs transitively (`PAYMENT_PROVIDER`
/// because `SubscriptionService` needs it, `UsageService`,
/// `NotificationsChannelsCoreModule` for alert delivery) and nothing
/// controller-bearing. `BillingModule` (the full module, API-process-only)
/// imports this instead of redeclaring the same providers.
///
/// Module 20 — Phase 8. `QuotaService` moved in here (it previously lived
/// only in the full, controller-bearing `BillingModule`) so `ReconModule`/
/// `VulnModule`'s job-creation command handlers — both API-process-only,
/// HTTP-facing modules, never part of the worker's DI graph — can import
/// this lightweight core module to enforce `RECON_JOBS`/`SCANNER_JOBS`
/// quotas at job-creation time without pulling in `BillingModule`'s own
/// controllers/guards. `QuotaService` only needs `PrismaService` (global)
/// and the two services already provided here, so this is a pure
/// relocation, not a new dependency.
@Module({
  imports: [NotificationsChannelsCoreModule],
  providers: [
    {
      provide: PAYMENT_PROVIDER,
      useFactory: (configService: ConfigService<EnvConfig, true>) => {
        const provider = configService.get('BILLING_PROVIDER', { infer: true });
        if (provider === 'stripe') return new StripePaymentProvider(configService);
        if (provider === 'manual') return new ManualPaymentProvider();
        return new NullPaymentProvider();
      },
      inject: [ConfigService],
    },
    SubscriptionService,
    UsageService,
    QuotaService,
    AiModelPricingService,
    AiBudgetEnforcerService,
  ],
  exports: [
    PAYMENT_PROVIDER,
    SubscriptionService,
    UsageService,
    QuotaService,
    AiModelPricingService,
    AiBudgetEnforcerService,
  ],
})
export class BillingCoreModule {}
