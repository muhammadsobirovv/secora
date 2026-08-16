import { Module } from '@nestjs/common';
import { PasswordHasherService } from '../auth/services/password-hasher.service.js';
import { CreateShareLinkHandler, RevokeShareLinkHandler } from './commands/share-links.commands.js';
import { AccessShareLinkHandler } from './commands/access-share-link.command.js';
import { ListShareLinksHandler } from './queries/share-links.query.js';
import { ShareLinksController } from './controllers/share-links.controller.js';
import { PublicShareController } from './controllers/public-share.controller.js';

/// Module 16 — Public Sharing (task #392). `PasswordHasherService` is
/// provided directly here (it's a stateless argon2 wrapper with no
/// constructor dependencies — see auth/services/password-hasher.
/// service.ts) rather than importing the whole `AuthModule`, which would
/// pull in JwtModule/PassportModule/RbacModule/WorkspacesModule/
/// UserPreferencesModule for a single leaf service this module doesn't
/// otherwise need. `PrismaModule` is `@Global()` so it needs no explicit
/// import (matches CollaborationModule's convention).
@Module({
  controllers: [ShareLinksController, PublicShareController],
  providers: [
    PasswordHasherService,
    CreateShareLinkHandler,
    RevokeShareLinkHandler,
    AccessShareLinkHandler,
    ListShareLinksHandler,
  ],
})
export class SharingModule {}
