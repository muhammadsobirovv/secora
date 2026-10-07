import { Global, Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { TargetsModule } from '../targets/targets.module.js';
import { TargetAuthorizationController } from './target-authorization.controller.js';
import { TargetAuthorizationService } from './target-authorization.service.js';

/// Global so the recon/vuln scan handlers, target creation and bug bounty
/// import can all reach TargetAuthorizationService without new imports.
@Global()
@Module({
  imports: [WorkspacesModule, ProjectsModule, TargetsModule],
  controllers: [TargetAuthorizationController],
  providers: [TargetAuthorizationService],
  exports: [TargetAuthorizationService],
})
export class TargetAuthorizationModule {}
