import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { ResearchSessionService } from './research-session.service.js';
import { ResearchSessionController } from './controllers/research-session.controller.js';

/// Module 16 — task #371. Imports WorkspacesModule so the controller can
/// resolve "the caller's workspace" from `userId` rather than trusting a
/// client-supplied workspaceId (see controller's doc comment).
@Module({
  imports: [WorkspacesModule],
  controllers: [ResearchSessionController],
  providers: [ResearchSessionService],
  exports: [ResearchSessionService],
})
export class ResearchSessionModule {}
