import { Module } from '@nestjs/common';
import { QuotaService } from './quota.service.js';
import { EntitlementService } from './entitlement.service.js';
import { InvoiceService } from './invoice.service.js';
import { BillingService } from './billing.service.js';
import { SubscriptionService } from './subscription.service.js';
import { UsageService } from './usage.service.js';
import { AiModelPricingService } from './ai-cost/ai-model-pricing.service.js';
import { AiBudgetEnforcerService } from './ai-cost/ai-budget-enforcer.service.js';
import { BillingController } from './controllers/billing.controller.js';
import { UsageController } from './controllers/usage.controller.js';
import { QuotaController } from './controllers/quota.controller.js';
import { AiCostControlController } from './controllers/ai-cost-control.controller.js';
import { StripeWebhookController } from './controllers/stripe-webhook.controller.js';
import { BillingCoreModule } from './billing-core.module.js';

/// Module 15 — Monetization (task #331/#332), AI cost control (task
/// #340). The API-process-only half: HTTP controllers plus the services
/// that don't need to exist in the worker process (`EntitlementService`,
/// `InvoiceService`, `BillingService` — nothing in the worker's
/// recon/vuln/AI execution paths reads an entitlement or renders an
/// invoice). `PAYMENT_PROVIDER`'s `useFactory`-keyed-off-`BILLING_PROVIDER`
/// binding and every provider `AiChatService` (which the worker process
/// also runs — see worker.module.ts) needs now live in `BillingCoreModule`,
/// imported here rather than redeclared — see that module's own doc
/// comment for why the split exists.
///
/// Module 20 — Phase 8. `QuotaService` moved to `BillingCoreModule` (so
/// `ReconModule`/`VulnModule` can enforce job-creation quotas without
/// importing this controller-bearing module) — no longer declared as its
/// own provider here, just re-exported from the import for anything that
/// already depends on getting it via `BillingModule`.
@Module({
  imports: [BillingCoreModule],
  controllers: [BillingController, UsageController, QuotaController, AiCostControlController, StripeWebhookController],
  providers: [EntitlementService, InvoiceService, BillingService],
  exports: [
    SubscriptionService,
    UsageService,
    QuotaService,
    EntitlementService,
    InvoiceService,
    BillingService,
    AiModelPricingService,
    AiBudgetEnforcerService,
  ],
})
export class BillingModule {}
