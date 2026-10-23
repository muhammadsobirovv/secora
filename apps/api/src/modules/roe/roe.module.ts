import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { PublicRoeController, RoeController } from './roe.controller.js';
import { RoeAuthorizationService } from './roe-authorization.service.js';
import { RoeCoreModule } from './roe-core.module.js';

/// Client engagement ("I'm testing for a client") authorizations: the HTTP
/// side. The read-only coverage check the scan gate and worker use lives in
/// RoeCoreModule.
@Module({
  imports: [WorkspacesModule, RoeCoreModule],
  controllers: [RoeController, PublicRoeController],
  providers: [RoeAuthorizationService],
  exports: [RoeAuthorizationService],
})
export class RoeModule {}
