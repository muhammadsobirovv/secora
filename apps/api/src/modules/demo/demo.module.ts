import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { UserPreferencesModule } from '../user-preferences/user-preferences.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { DemoController } from './controllers/demo.controller.js';
import { DemoSessionService } from './demo-session.service.js';
import { DemoSeedService } from './demo-seed.service.js';
import { DemoCleanupService } from './demo-cleanup.service.js';

/// Module 15 — task #352 "Demo mode — isolated demo environment".
///
/// PrismaService/AuditService/PollerLeaseService/ConfigService come from
/// `@Global()` modules already imported once in `app.module.ts`
/// (PrismaModule, AuditModule, ProvidersModule) — no need to re-import
/// them here. `AuthModule`/`WorkspacesModule`/`UserPreferencesModule`/
/// `RbacModule` are imported for the specific repository tokens and
/// `SessionIssuerService`/`RbacService` this module's one write path
/// needs, mirroring exactly what `RegisterUseCase` depends on (see
/// `demo-session.service.ts`'s doc comment for the full "how this differs
/// from registration" reasoning).
@Module({
  imports: [AuthModule, WorkspacesModule, UserPreferencesModule, RbacModule],
  controllers: [DemoController],
  providers: [DemoSessionService, DemoSeedService, DemoCleanupService],
})
export class DemoModule {}
