import { Module } from '@nestjs/common';
import { ResearcherMemoryModule } from '../researcher-memory/researcher-memory.module.js';
import {
  DisableExtensionHandler,
  EnableExtensionHandler,
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
/// duplicating the enforcement logic.
@Module({
  imports: [ResearcherMemoryModule],
  controllers: [ExtensionRegistryController],
  providers: [
    RegisterExtensionHandler,
    EnableExtensionHandler,
    DisableExtensionHandler,
    UnregisterExtensionHandler,
    ListExtensionsHandler,
    GetExtensionHandler,
    ExtensionPermissionEnforcer,
  ],
  exports: [ExtensionPermissionEnforcer],
})
export class ExtensionRegistryModule {}
