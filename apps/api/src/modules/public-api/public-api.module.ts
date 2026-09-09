import { Module } from '@nestjs/common';
import { ApiKeysModule } from '../api-keys/api-keys.module.js';
import { ObservabilityModule } from '../observability/observability.module.js';
import { CreateApiKeyHandler, RevokeApiKeyHandler, RotateApiKeyHandler } from './commands/api-keys.commands.js';
import { ListApiKeysHandler } from './queries/api-keys.query.js';
import {
  CreateWebhookTokenHandler,
  DeleteWebhookTokenHandler,
  TestWebhookTokenHandler,
  UpdateWebhookTokenHandler,
} from './commands/webhook-tokens.commands.js';
import { RedeliverWebhookDeliveryHandler } from './commands/webhook-deliveries.commands.js';
import { ListWebhookTokensHandler } from './queries/webhook-tokens.query.js';
import { ListWebhookDeliveriesHandler } from './queries/webhook-deliveries.query.js';
import { ApiKeysController } from './controllers/api-keys.controller.js';
import { WebhookTokensController } from './controllers/webhook-tokens.controller.js';
import { ApiVersionController } from './controllers/api-version.controller.js';
import { ApiKeyAuthGuard } from './guards/api-key-auth.guard.js';
import { WebhookDispatchHandler } from './webhooks/webhook-dispatch.handler.js';
import { WebhookDeliveryQueueService } from './webhooks/webhook-delivery-queue.service.js';

/// Module 9's Public REST API surface — activates Module 1's
/// schema-only ApiKey model (personal + new workspace-scoped keys),
/// Webhook Tokens (new), and `ApiKeyAuthGuard` (a reusable, opt-in
/// alternative to the global JwtAuthGuard — see that guard's doc comment
/// for why it isn't wired globally). Rate limiting for API-key-
/// authenticated traffic reuses the existing `ThrottlerModule.forRoot()`
/// registration from app.module.ts (Module 1) — `@Throttle()` on any
/// route this guard protects applies per-key the same way it applies
/// per-IP elsewhere, since Nest's default throttler storage keys by
/// `req.ip` unless overridden; a per-API-key throttler key (rather than
/// per-IP) is a documented follow-up in docs/adr/
/// 0009-bug-bounty-operating-system.md, not implemented here, since it
/// requires a custom `ThrottlerStorage`/tracker beyond this module's
/// scope. OpenAPI/Swagger: every controller here is already covered by
/// the app-wide `SwaggerModule.setup()` call (Module 1's bootstrap.ts) —
/// no separate Swagger wiring needed per module.
@Module({
  imports: [ApiKeysModule, ObservabilityModule],
  controllers: [ApiKeysController, WebhookTokensController, ApiVersionController],
  providers: [
    CreateApiKeyHandler,
    RevokeApiKeyHandler,
    RotateApiKeyHandler,
    ListApiKeysHandler,
    CreateWebhookTokenHandler,
    UpdateWebhookTokenHandler,
    DeleteWebhookTokenHandler,
    TestWebhookTokenHandler,
    ListWebhookTokensHandler,
    RedeliverWebhookDeliveryHandler,
    ListWebhookDeliveriesHandler,
    WebhookDispatchHandler,
    WebhookDeliveryQueueService,
    ApiKeyAuthGuard,
  ],
  // `ApiKeysModule` re-exported alongside the guard: `ApiKeyAuthGuard`
  // itself depends on `API_KEYS_REPOSITORY` (provided by `ApiKeysModule`,
  // imported above but never re-exported). Any module that imports
  // `PublicApiModule` purely to use `ApiKeyAuthGuard` on its own
  // controllers (e.g. DistributedJobsModule) needs that token visible in
  // its own DI scope too, since Nest resolves a `@UseGuards(GuardClass)`
  // reference's constructor params against the *consuming* module's
  // import graph — first surfaced the first time this app was actually
  // booted end-to-end (`Nest can't resolve dependencies of the
  // ApiKeyAuthGuard... Symbol(API_KEYS_REPOSITORY)... in the
  // DistributedJobsModule module`).
  exports: [ApiKeyAuthGuard, ApiKeysModule],
})
export class PublicApiModule {}
