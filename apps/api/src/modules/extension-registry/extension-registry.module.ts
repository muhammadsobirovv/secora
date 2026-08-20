import { Module } from '@nestjs/common';
import { ResearcherMemoryModule } from '../researcher-memory/researcher-memory.module.js';
import {
  DisableExtensionHandler,
  EnableExtensionHandler,
  InvokeExtensionHandler,
  RegisterExtensionHandler,
  UnregisterExtensionHandler,
} from './commands/extension-registry.commands.js';
import { GetExtensionHandler, ListExtensionsHandler } from './queries/extension-registry.query.js';
import { ExtensionRegistryController } from './controllers/extension-registry.controller.js';
import { ExtensionPermissionEnforcer } from './extension-permission-enforcer.util.js';

/// Module 16 — Extension API registry (task #401). Imports
/// `ResearcherMemoryModule` solely for its exported
/// `ResearcherMemoryWorkspaceResolver`, the same reuse already done by
/// `KnowledgeGraphModule`. `ExtensionPermissionEnforcer` is exported so
/// other modules (a future tool-invocation/workflow-node executor) can
/// inject it to authorize an extension before invoking it, without
/// duplicating the enforcement logic. `InvokeExtensionHandler` (hardening
/// pass, task #454) is this module's own first real consumer of the
/// enforcer, via `POST /extensions/:id/invoke`.
@Module({
  imports: [ResearcherMemoryModule],
  controllers: [ExtensionRegistryController],
  providers: [
    RegisterExtensionHandler,
    EnableExtensionHandler,
    DisableExtensionHandler,
    UnregisterExtensionHandler,
    InvokeExtensionHandler,
    ListExtensionsHandler,
    GetExtensionHandler,
    ExtensionPermissionEnforcer,
  ],
  exports: [ExtensionPermissionEnforcer],
})
export class ExtensionRegistryModule {}
