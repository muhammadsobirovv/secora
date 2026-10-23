import { Global, Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { RoeCoreModule } from '../roe/roe-core.module.js';
import { TargetsModule } from '../targets/targets.module.js';
import { TargetAuthorizationController } from './target-authorization.controller.js';
import { TargetAuthorizationService } from './target-authorization.service.js';
import { TargetOwnershipController } from './target-ownership.controller.js';
import { TargetOwnershipService } from './target-ownership.service.js';
import { NetworkOwnershipProbe, OWNERSHIP_PROBE } from './target-ownership.probe.js';

/// Global so the recon/vuln scan handlers, target creation and bug bounty
/// import can all reach TargetAuthorizationService without new imports.
@Global()
@Module({
  imports: [WorkspacesModule, ProjectsModule, TargetsModule, RoeCoreModule],
  controllers: [TargetAuthorizationController, TargetOwnershipController],
  providers: [
    TargetAuthorizationService,
    TargetOwnershipService,
    { provide: OWNERSHIP_PROBE, useClass: NetworkOwnershipProbe },
  ],
  exports: [TargetAuthorizationService, TargetOwnershipService],
})
export class TargetAuthorizationModule {}
