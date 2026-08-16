import { Module } from '@nestjs/common';
import { RealtimeHubService } from './realtime-hub.service.js';
import { RealtimePublishHandler } from './realtime-publish.handler.js';
import { RealtimeController } from './controllers/realtime.controller.js';

/// Module 16 — Real-time gateway (task #391). No module imports needed
/// beyond Nest's defaults — `PrismaService` is provided globally
/// (PrismaModule is `@Global()`), and `resolveWorkspaceMembership` is a
/// plain function import, not a provider, so no dependency on
/// CollaborationModule is required.
@Module({
  controllers: [RealtimeController],
  providers: [RealtimeHubService, RealtimePublishHandler],
})
export class RealtimeModule {}
