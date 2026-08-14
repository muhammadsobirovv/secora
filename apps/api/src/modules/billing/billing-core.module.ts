import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../config/env.validation.js';
import { PAYMENT_PROVIDER } from '../../common/providers/tokens.js';
import { NullPaymentProvider } from './providers/null-payment-provider.js';
import { ManualPaymentProvider } from './providers/manual-payment-provider.js';
import { StripePaymentProvider } from './providers/stripe-payment-provider.js';
import { SubscriptionService } from './subscription.service.js';
import { UsageService } from './usage.service.js';
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
    AiModelPricingService,
    AiBudgetEnforcerService,
  ],
  exports: [
    PAYMENT_PROVIDER,
    SubscriptionService,
    UsageService,
    AiModelPricingService,
    AiBudgetEnforcerService,
  ],
})
export class BillingCoreModule {}
