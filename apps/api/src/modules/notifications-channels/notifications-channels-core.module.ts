import { Module } from '@nestjs/common';
import { NotificationDispatcherService } from './services/notification-dispatcher.service.js';

/// Module 15 — AI cost control (task #340) needed a controller-free way to
/// inject `NotificationDispatcherService` into `BillingCoreModule` (which
/// the worker process's `AiCoreModule` import must stay controller-free —
/// see worker.module.ts's doc comment on why: no HTTP guards/controllers
/// in a `NestFactory.createApplicationContext()` process). Same "Core
/// module has the providers, full module adds controllers + imports Core"
/// split `VulnCoreModule`/`ReconCoreModule`/`BugBountyCoreModule` already
/// established — `NotificationsChannelsModule` now imports this instead of
/// redeclaring the provider.
@Module({
  providers: [NotificationDispatcherService],
  exports: [NotificationDispatcherService],
})
export class NotificationsChannelsCoreModule {}
