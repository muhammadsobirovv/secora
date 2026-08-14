import { Module } from '@nestjs/common';
import { UserPreferencesModule } from '../user-preferences/user-preferences.module.js';
import { TelemetryCollectorService } from './telemetry-collector.service.js';
import { TelemetryRecordingHandler } from './event-handlers/telemetry-recording.handler.js';

/// Module 15 — task #347. Registered in both `AppModule` (API process)
/// and `WorkerModule` (background job process) — see
/// `TelemetryRecordingHandler`'s doc comment for why: the recon/vuln-scan
/// events it listens for are published from the worker process, and
/// `@nestjs/cqrs`'s in-memory `EventBus` doesn't cross OS-process
/// boundaries. Each process therefore runs its own independent
/// `TelemetryCollectorService` instance with its own in-memory counters
/// and its own daily flush — a deliberate simplification (no cross-process
/// counter merging) consistent with this being lossy, best-effort,
/// aggregate usage telemetry rather than anything requiring exact counts.
@Module({
  imports: [UserPreferencesModule],
  providers: [TelemetryCollectorService, TelemetryRecordingHandler],
  exports: [TelemetryCollectorService],
})
export class TelemetryModule {}
