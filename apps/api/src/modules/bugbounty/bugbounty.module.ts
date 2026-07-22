import { Module } from '@nestjs/common';
import { BugBountyCoreModule } from './bugbounty-core.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { TargetsModule } from '../targets/targets.module.js';
import { NotesModule } from '../notes/notes.module.js';
import { EvidenceModule } from '../evidence/evidence.module.js';
import { ReconCoreModule } from '../recon/recon-core.module.js';
import { VulnCoreModule } from '../vuln/vuln-core.module.js';
import { AiCoreModule } from '../ai/ai-core.module.js';
import { ActivityModule } from '../activity/activity.module.js';
// Module 9 integration point: BugBountyDeadlineNotifierService (below)
// injects NotificationDispatcherService to fan Module 6 deadline
// notifications out to configured channels. Importing the whole module
// (not just the service) is the standard Nest way to make an exported
// provider visible here.
import { NotificationsChannelsModule } from '../notifications-channels/notifications-channels.module.js';
// Dashboard's leaderboard widget looks up UsersRepository.findById() for
// display names — the one place this module needs Auth's provider.
import { AuthModule } from '../auth/auth.module.js';

// Programs / scope / targets
import { CreateBugBountyProgramHandler } from './commands/create-bugbounty-program.command.js';
import { UpdateBugBountyProgramHandler } from './commands/update-bugbounty-program.command.js';
import { DeleteBugBountyProgramHandler } from './commands/delete-bugbounty-program.command.js';
import { ImportBugBountyProgramHandler } from './commands/import-bugbounty-program.command.js';
import { ReimportBugBountyProgramHandler } from './commands/reimport-bugbounty-program.command.js';
import {
  LinkProgramTargetHandler,
  UnlinkProgramTargetHandler,
} from './commands/manage-program-target.commands.js';
import {
  AddScopeItemHandler,
  UpdateScopeItemHandler,
  RemoveScopeItemHandler,
} from './commands/manage-scope-item.commands.js';
import { GetBugBountyProgramHandler } from './queries/get-bugbounty-program.query.js';
import { ListBugBountyProgramsHandler } from './queries/list-bugbounty-programs.query.js';
import { ClassifyScopeValueHandler } from './queries/classify-scope-value.query.js';
import { DetectProgramImportUpdateHandler } from './queries/detect-program-import-update.query.js';

// Asset inventory
import { AssetInventoryService } from './asset-inventory/asset-inventory.service.js';
import { ListAssetInventoryHandler } from './queries/list-asset-inventory.query.js';

// Finding lifecycle
import {
  CreateBugBountyFindingHandler,
  UpdateBugBountyFindingHandler,
  TransitionBugBountyFindingStageHandler,
  DeleteBugBountyFindingHandler,
} from './commands/bugbounty-finding-lifecycle.commands.js';
import {
  ListBugBountyFindingsHandler,
  GetBugBountyFindingHandler,
} from './queries/bugbounty-finding.queries.js';
import { CheckDuplicateFindingHandler } from './queries/check-duplicate-finding.query.js';

// Bug reports
import {
  CreateBugReportHandler,
  UpdateBugReportHandler,
  SubmitBugReportHandler,
  DeleteBugReportHandler,
} from './commands/bug-report-lifecycle.commands.js';
import { GenerateBugReportDraftHandler } from './commands/generate-bug-report-draft.command.js';
import { ReportDraftAssistantService } from './reports/report-draft-assistant.service.js';
import {
  CorrectGrammarHandler,
  ReviewReportQualityHandler,
} from './commands/report-ai-assist.commands.js';
import {
  CreateReportCustomTemplateHandler,
  UpdateReportCustomTemplateHandler,
  DeleteReportCustomTemplateHandler,
} from './commands/report-custom-templates.commands.js';
import {
  ListBugReportsHandler,
  GetBugReportHandler,
  RenderBugReportHandler,
} from './queries/bug-report.queries.js';
import { ExportBugReportHandler } from './queries/export-bug-report.query.js';
import { ExportBugReportV2Handler } from './queries/export-bug-report-v2.query.js';
import { ListReportCustomTemplatesHandler } from './queries/list-report-custom-templates.query.js';

// Payload library
import {
  CreatePayloadLibraryEntryHandler,
  UpdatePayloadLibraryEntryHandler,
  DeletePayloadLibraryEntryHandler,
} from './commands/payload-library.commands.js';
import { ExplainPayloadHandler } from './commands/explain-payload.command.js';
import {
  ListPayloadLibraryHandler,
  GetPayloadLibraryEntryHandler,
} from './queries/list-payload-library.query.js';

// Knowledge base
import {
  CreateKnowledgeBaseNoteHandler,
  UpdateKnowledgeBaseNoteHandler,
  DeleteKnowledgeBaseNoteHandler,
  SaveConversationSnapshotHandler,
} from './commands/knowledge-base.commands.js';
import {
  ListKnowledgeBaseNotesHandler,
  GetKnowledgeBaseNoteHandler,
} from './queries/knowledge-base.queries.js';

// Bookmarks
import {
  CreateBookmarkHandler,
  DeleteBookmarkHandler,
} from './commands/bookmark.commands.js';
import { ListBookmarksHandler } from './queries/list-bookmarks.query.js';

// Dashboard / statistics
import {
  GetBugBountyDashboardHandler,
  GetBugBountyStatisticsHandler,
} from './queries/bugbounty-dashboard.queries.js';

// Calendar
import {
  CreateCalendarEventHandler,
  UpdateCalendarEventHandler,
  DeleteCalendarEventHandler,
} from './commands/bugbounty-calendar.commands.js';
import {
  ListCalendarEventsHandler,
  GetCalendarEventHandler,
} from './queries/list-calendar-events.query.js';

// Notifications
import {
  MarkNotificationReadHandler,
  MarkAllNotificationsReadHandler,
} from './commands/notification.commands.js';
import { ListNotificationsHandler } from './queries/list-notifications.query.js';

// Search
import { SearchBugBountyHandler } from './queries/search-bugbounty.query.js';

// Module 9: CVSS calculator
import { CalculateCvssHandler } from './queries/calculate-cvss.query.js';

// Module 9: Analytics
import { GetBugBountyAnalyticsHandler } from './queries/get-bugbounty-analytics.query.js';

// Module 9: AI Bug Bounty Assistant
import { BugBountyAiAssistantService } from './ai/bugbounty-ai-assistant.service.js';
import {
  ReviewFindingHandler,
  SuggestPayloadsHandler,
  GeneratePocHandler,
  GenerateReproStepsHandler,
  GenerateImpactHandler,
  GenerateRemediationHandler,
  CalculateSeverityHandler,
} from './commands/finding-ai-assist.commands.js';
import {
  SuggestAttackPathsHandler,
  SummarizeEngagementHandler,
} from './commands/engagement-ai-assist.commands.js';

// Controllers
import { BugBountyProgramsController } from './controllers/bugbounty-programs.controller.js';
import { BugBountyAssetsController } from './controllers/bugbounty-assets.controller.js';
import { BugBountyFindingsController } from './controllers/bugbounty-findings.controller.js';
import { CvssController } from './controllers/cvss.controller.js';
import { BugBountyAiAssistantController } from './controllers/bugbounty-ai-assistant.controller.js';
import { BugBountyAnalyticsController } from './controllers/bugbounty-analytics.controller.js';
import { BugReportsController } from './controllers/bug-reports.controller.js';
import { PayloadLibraryController } from './controllers/payload-library.controller.js';
import { KnowledgeBaseController } from './controllers/knowledge-base.controller.js';
import { BookmarksController } from './controllers/bookmarks.controller.js';
import { BugBountyDashboardController } from './controllers/bugbounty-dashboard.controller.js';
import { BugBountyCalendarController } from './controllers/bugbounty-calendar.controller.js';
import { BugBountyNotificationsController } from './controllers/bugbounty-notifications.controller.js';
import { BugBountySearchController } from './controllers/bugbounty-search.controller.js';

const COMMAND_HANDLERS = [
  CreateBugBountyProgramHandler,
  UpdateBugBountyProgramHandler,
  DeleteBugBountyProgramHandler,
  ImportBugBountyProgramHandler,
  ReimportBugBountyProgramHandler,
  LinkProgramTargetHandler,
  UnlinkProgramTargetHandler,
  AddScopeItemHandler,
  UpdateScopeItemHandler,
  RemoveScopeItemHandler,
  CreateBugBountyFindingHandler,
  UpdateBugBountyFindingHandler,
  TransitionBugBountyFindingStageHandler,
  DeleteBugBountyFindingHandler,
  CreateBugReportHandler,
  UpdateBugReportHandler,
  SubmitBugReportHandler,
  DeleteBugReportHandler,
  GenerateBugReportDraftHandler,
  CorrectGrammarHandler,
  ReviewReportQualityHandler,
  CreateReportCustomTemplateHandler,
  UpdateReportCustomTemplateHandler,
  DeleteReportCustomTemplateHandler,
  CreatePayloadLibraryEntryHandler,
  UpdatePayloadLibraryEntryHandler,
  DeletePayloadLibraryEntryHandler,
  ExplainPayloadHandler,
  CreateKnowledgeBaseNoteHandler,
  UpdateKnowledgeBaseNoteHandler,
  DeleteKnowledgeBaseNoteHandler,
  SaveConversationSnapshotHandler,
  CreateBookmarkHandler,
  DeleteBookmarkHandler,
  CreateCalendarEventHandler,
  UpdateCalendarEventHandler,
  DeleteCalendarEventHandler,
  MarkNotificationReadHandler,
  MarkAllNotificationsReadHandler,
  ReviewFindingHandler,
  SuggestPayloadsHandler,
  GeneratePocHandler,
  GenerateReproStepsHandler,
  GenerateImpactHandler,
  GenerateRemediationHandler,
  CalculateSeverityHandler,
  SuggestAttackPathsHandler,
  SummarizeEngagementHandler,
];

const QUERY_HANDLERS = [
  GetBugBountyProgramHandler,
  ListBugBountyProgramsHandler,
  ClassifyScopeValueHandler,
  DetectProgramImportUpdateHandler,
  ListAssetInventoryHandler,
  ListBugBountyFindingsHandler,
  GetBugBountyFindingHandler,
  CheckDuplicateFindingHandler,
  ListBugReportsHandler,
  GetBugReportHandler,
  RenderBugReportHandler,
  ExportBugReportHandler,
  ExportBugReportV2Handler,
  ListReportCustomTemplatesHandler,
  ListPayloadLibraryHandler,
  GetPayloadLibraryEntryHandler,
  ListKnowledgeBaseNotesHandler,
  GetKnowledgeBaseNoteHandler,
  ListBookmarksHandler,
  GetBugBountyDashboardHandler,
  GetBugBountyStatisticsHandler,
  ListCalendarEventsHandler,
  GetCalendarEventHandler,
  ListNotificationsHandler,
  SearchBugBountyHandler,
  CalculateCvssHandler,
  GetBugBountyAnalyticsHandler,
];

/// The HTTP-facing half of Module 6 — BugBountyCoreModule's repositories
/// plus controllers and CQRS handlers, mirroring VulnModule/ReconModule/
/// AiModule's "core module + HTTP module" split.
///
/// Imports beyond BugBountyCoreModule: WorkspacesModule/ProjectsModule/
/// TargetsModule for the workspace-ownership-chain authorization checks
/// every handler goes through (see authorization.util.ts); NotesModule/
/// EvidenceModule/ReconCoreModule/VulnCoreModule because
/// AssetInventoryService injects NOTES_REPOSITORY/EVIDENCE_REPOSITORY/
/// RECON_FINDINGS_REPOSITORY/VULN_FINDINGS_REPOSITORY directly (NestJS
/// module encapsulation: a module that injects a token must have the
/// token's providing module in its own `imports`, even if some other
/// imported module already has it — see AiModule's identical comment for
/// VulnCoreModule/ReconCoreModule/NotesModule); AiCoreModule for
/// AiMemoryService/AiProviderRegistryService/AiPromptBuilderService/
/// AI_MEMORY_REPOSITORY (Report Draft Assistant, Payload "Explain",
/// Duplicate Detection, and finding/payload indexing all reuse Module 5's
/// AI seam rather than duplicating it); ActivityModule for
/// ACTIVITY_REPOSITORY (the dashboard's "recent activity" widget reads it
/// directly — the 8 named domain events themselves are auto-recorded by
/// ActivityRecordingHandler with no wiring needed here).
@Module({
  imports: [
    BugBountyCoreModule,
    WorkspacesModule,
    ProjectsModule,
    TargetsModule,
    NotesModule,
    EvidenceModule,
    ReconCoreModule,
    VulnCoreModule,
    AiCoreModule,
    ActivityModule,
    NotificationsChannelsModule,
    AuthModule,
  ],
  controllers: [
    BugBountyProgramsController,
    BugBountyAssetsController,
    BugBountyFindingsController,
    BugReportsController,
    PayloadLibraryController,
    KnowledgeBaseController,
    BookmarksController,
    BugBountyDashboardController,
    BugBountyCalendarController,
    BugBountyNotificationsController,
    BugBountySearchController,
    CvssController,
    BugBountyAiAssistantController,
    BugBountyAnalyticsController,
  ],
  providers: [
    AssetInventoryService,
    ReportDraftAssistantService,
    BugBountyAiAssistantService,
    ...COMMAND_HANDLERS,
    ...QUERY_HANDLERS,
  ],
})
export class BugBountyModule {}
