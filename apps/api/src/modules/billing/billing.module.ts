import { Module } from '@nestjs/common';
import { EntitlementService } from './entitlement.service.js';
import { InvoiceService } from './invoice.service.js';
import { BillingService } from './billing.service.js';
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
  // Module 20 Phase 8 fix: NestJS cannot re-export an individual provider
  // that only lives in an *imported* module's own `providers` — it can
  // only export providers declared directly in this module's `providers`,
  // or re-export an entire imported module. `SubscriptionService`/
  // `UsageService`/`QuotaService`/`AiModelPricingService`/
  // `AiBudgetEnforcerService` are all provided by `BillingCoreModule`
  // (never redeclared here), so the whole module is exported instead of
  // listing them individually — this was the first `prisma migrate
  // deploy`-adjacent full application boot this project's history, which
  // is what surfaced the wiring bug (`Nest cannot export a provider/module
  // that is not a part of the currently processed module`).
  exports: [BillingCoreModule, EntitlementService, InvoiceService, BillingService],
})
export class BillingModule {}
