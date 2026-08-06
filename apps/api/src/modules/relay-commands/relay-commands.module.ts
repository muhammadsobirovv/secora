import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { ObservabilityModule } from '../observability/observability.module.js';
import { RelayCommandsRepository } from './relay-commands.repository.js';
import { RelayCommandsController } from './controllers/relay-commands.controller.js';
import {
  CompleteRelayCommandHandler,
  EnqueueRelayCommandHandler,
} from './commands/relay-commands.commands.js';
import { ListPendingRelayCommandsHandler } from './queries/relay-commands.queries.js';

/// Module 13 — Local Execution (task #288). Imports `WorkspacesModule`
/// for personal-workspace resolution; exports
/// `EnqueueRelayCommandHandler`'s command class is used directly (not
/// the handler) by `McpModule`'s `McpToolRegistryService` via
/// `CommandBus.execute(new EnqueueRelayCommandCommand(...))` — CQRS
/// dispatch needs no module-to-module DI wiring beyond both handlers
/// being registered somewhere in the app (see app.module.ts).
@Module({
  imports: [WorkspacesModule, ObservabilityModule],
  controllers: [RelayCommandsController],
  providers: [
    RelayCommandsRepository,
    EnqueueRelayCommandHandler,
    CompleteRelayCommandHandler,
    ListPendingRelayCommandsHandler,
  ],
})
export class RelayCommandsModule {}
