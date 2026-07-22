import { Module } from '@nestjs/common';
import { BUGBOUNTY_PROGRAMS_REPOSITORY } from './domain/repositories/bugbounty-programs.repository.interface.js';
import { PrismaBugBountyProgramsRepository } from './infrastructure/persistence/prisma/prisma-bugbounty-programs.repository.js';
import { BUGBOUNTY_FINDINGS_REPOSITORY } from './domain/repositories/bugbounty-findings.repository.interface.js';
import { PrismaBugBountyFindingsRepository } from './infrastructure/persistence/prisma/prisma-bugbounty-findings.repository.js';
import { BUG_REPORTS_REPOSITORY } from './domain/repositories/bug-reports.repository.interface.js';
import { PrismaBugReportsRepository } from './infrastructure/persistence/prisma/prisma-bug-reports.repository.js';
import { PAYLOAD_LIBRARY_REPOSITORY } from './domain/repositories/payload-library.repository.interface.js';
import { PrismaPayloadLibraryRepository } from './infrastructure/persistence/prisma/prisma-payload-library.repository.js';
import { KNOWLEDGE_BASE_REPOSITORY } from './domain/repositories/knowledge-base.repository.interface.js';
import { PrismaKnowledgeBaseRepository } from './infrastructure/persistence/prisma/prisma-knowledge-base.repository.js';
import { BOOKMARKS_REPOSITORY } from './domain/repositories/bookmarks.repository.interface.js';
import { PrismaBookmarksRepository } from './infrastructure/persistence/prisma/prisma-bookmarks.repository.js';
import { BUGBOUNTY_CALENDAR_REPOSITORY } from './domain/repositories/bugbounty-calendar.repository.interface.js';
import { PrismaBugBountyCalendarRepository } from './infrastructure/persistence/prisma/prisma-bugbounty-calendar.repository.js';
import { BUGBOUNTY_NOTIFICATIONS_REPOSITORY } from './domain/repositories/bugbounty-notifications.repository.interface.js';
import { PrismaBugBountyNotificationsRepository } from './infrastructure/persistence/prisma/prisma-bugbounty-notifications.repository.js';
import { HackerOneImporter } from './importers/adapters/hackerone.importer.js';
import { BugcrowdImporter } from './importers/adapters/bugcrowd.importer.js';
import { IntigritiImporter } from './importers/adapters/intigriti.importer.js';
import { MarkdownImporter } from './importers/adapters/markdown.importer.js';
import { JsonImporter } from './importers/adapters/json.importer.js';
import { ProgramImporterRegistryService } from './importers/program-importer-registry.service.js';

/// The Module 6 equivalent of VulnCoreModule/AiCoreModule — repository
/// providers only, no controllers, so it can be imported by both the HTTP
/// module and (if a future background job needs these repositories, e.g.
/// the deadline-reminder scheduler in Task 103) a worker context without
/// dragging controllers along.
@Module({
  providers: [
    {
      provide: BUGBOUNTY_PROGRAMS_REPOSITORY,
      useClass: PrismaBugBountyProgramsRepository,
    },
    {
      provide: BUGBOUNTY_FINDINGS_REPOSITORY,
      useClass: PrismaBugBountyFindingsRepository,
    },
    { provide: BUG_REPORTS_REPOSITORY, useClass: PrismaBugReportsRepository },
    {
      provide: PAYLOAD_LIBRARY_REPOSITORY,
      useClass: PrismaPayloadLibraryRepository,
    },
    {
      provide: KNOWLEDGE_BASE_REPOSITORY,
      useClass: PrismaKnowledgeBaseRepository,
    },
    { provide: BOOKMARKS_REPOSITORY, useClass: PrismaBookmarksRepository },
    {
      provide: BUGBOUNTY_CALENDAR_REPOSITORY,
      useClass: PrismaBugBountyCalendarRepository,
    },
    {
      provide: BUGBOUNTY_NOTIFICATIONS_REPOSITORY,
      useClass: PrismaBugBountyNotificationsRepository,
    },
    HackerOneImporter,
    BugcrowdImporter,
    IntigritiImporter,
    MarkdownImporter,
    JsonImporter,
    ProgramImporterRegistryService,
  ],
  exports: [
    BUGBOUNTY_PROGRAMS_REPOSITORY,
    BUGBOUNTY_FINDINGS_REPOSITORY,
    BUG_REPORTS_REPOSITORY,
    PAYLOAD_LIBRARY_REPOSITORY,
    KNOWLEDGE_BASE_REPOSITORY,
    BOOKMARKS_REPOSITORY,
    BUGBOUNTY_CALENDAR_REPOSITORY,
    BUGBOUNTY_NOTIFICATIONS_REPOSITORY,
    ProgramImporterRegistryService,
  ],
})
export class BugBountyCoreModule {}
