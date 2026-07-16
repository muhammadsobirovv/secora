import {
  BOOKMARK_ENDPOINTS,
  BUGBOUNTY_ASSET_ENDPOINTS,
  BUGBOUNTY_CALENDAR_ENDPOINTS,
  BUGBOUNTY_DASHBOARD_ENDPOINTS,
  BUGBOUNTY_FINDING_ENDPOINTS,
  BUGBOUNTY_NOTIFICATION_ENDPOINTS,
  BUGBOUNTY_PROGRAM_ENDPOINTS,
  BUGBOUNTY_SEARCH_ENDPOINTS,
  BUG_REPORT_ENDPOINTS,
  KNOWLEDGE_BASE_ENDPOINTS,
  PAYLOAD_LIBRARY_ENDPOINTS,
} from "@pentesthub/shared";
import type {
  AssetInventoryEntryDto,
  AssetInventoryQueryDto,
  BookmarkDto,
  BugBountyCalendarEventDto,
  BugBountyDashboardDto,
  BugBountyFindingDto,
  BugBountyNotificationDto,
  BugBountyProgramDetailDto,
  BugBountyProgramDto,
  BugBountyProgramScopeItemDto,
  BugBountyProgramTargetDto,
  BugBountySearchResultDto,
  BugBountyStatisticsDto,
  BugReportDto,
  CheckDuplicateFindingRequestDto,
  CheckDuplicateFindingResultDto,
  ClassifyScopeRequestDto,
  CreateBookmarkRequestDto,
  CreateBugBountyFindingRequestDto,
  CreateBugBountyProgramRequestDto,
  CreateBugReportRequestDto,
  CreateCalendarEventRequestDto,
  CreateKnowledgeBaseNoteRequestDto,
  CreatePayloadLibraryEntryRequestDto,
  CreateScopeItemRequestDto,
  ExplainPayloadRequestDto,
  ExportBugReportRequestDto,
  ExportBugReportResultDto,
  GenerateBugReportDraftRequestDto,
  GenerateBugReportDraftResultDto,
  ImportProgramRequestDto,
  ImportProgramResultDto,
  KnowledgeBaseNoteDto,
  LinkProgramTargetRequestDto,
  ListBookmarksQueryDto,
  ListBugBountyFindingsQueryDto,
  ListBugBountyProgramsQueryDto,
  ListBugReportsQueryDto,
  ListCalendarEventsQueryDto,
  ListKnowledgeBaseNotesQueryDto,
  ListNotificationsQueryDto,
  ListPayloadLibraryQueryDto,
  PayloadLibraryEntryDto,
  RenderedBugReportDto,
  ScopeClassificationResultDto,
  SubmitBugReportRequestDto,
  TransitionBugBountyFindingStageRequestDto,
  UpdateBugBountyFindingRequestDto,
  UpdateBugBountyProgramRequestDto,
  UpdateBugReportRequestDto,
  UpdateCalendarEventRequestDto,
  UpdateKnowledgeBaseNoteRequestDto,
  UpdatePayloadLibraryEntryRequestDto,
  UpdateScopeItemRequestDto,
} from "@pentesthub/shared";
import { apiFetch } from "./client";

function toQueryString(query: Record<string, string | number | boolean | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

// ---------------------------------------------------------------------------
// Programs / Scope / Targets / Import
// ---------------------------------------------------------------------------

export function listBugBountyPrograms(query: ListBugBountyProgramsQueryDto = {}) {
  return apiFetch<BugBountyProgramDto[]>(
    `${BUGBOUNTY_PROGRAM_ENDPOINTS.list}${toQueryString(query as Record<string, string | undefined>)}`,
  );
}

export function getBugBountyProgram(id: string) {
  return apiFetch<BugBountyProgramDetailDto>(BUGBOUNTY_PROGRAM_ENDPOINTS.get(id));
}

export function createBugBountyProgram(data: CreateBugBountyProgramRequestDto) {
  return apiFetch<BugBountyProgramDto>(BUGBOUNTY_PROGRAM_ENDPOINTS.create, { method: "POST", body: data });
}

export function updateBugBountyProgram(id: string, data: UpdateBugBountyProgramRequestDto) {
  return apiFetch<BugBountyProgramDto>(BUGBOUNTY_PROGRAM_ENDPOINTS.update(id), { method: "PATCH", body: data });
}

export function deleteBugBountyProgram(id: string) {
  return apiFetch<void>(BUGBOUNTY_PROGRAM_ENDPOINTS.delete(id), { method: "DELETE" });
}

export function importBugBountyProgram(data: ImportProgramRequestDto) {
  return apiFetch<ImportProgramResultDto>(BUGBOUNTY_PROGRAM_ENDPOINTS.import, { method: "POST", body: data });
}

export function addScopeItem(programId: string, data: CreateScopeItemRequestDto) {
  return apiFetch<BugBountyProgramScopeItemDto>(BUGBOUNTY_PROGRAM_ENDPOINTS.scope(programId), {
    method: "POST",
    body: data,
  });
}

export function updateScopeItem(programId: string, scopeItemId: string, data: UpdateScopeItemRequestDto) {
  return apiFetch<BugBountyProgramScopeItemDto>(BUGBOUNTY_PROGRAM_ENDPOINTS.scopeItem(programId, scopeItemId), {
    method: "PATCH",
    body: data,
  });
}

export function removeScopeItem(programId: string, scopeItemId: string) {
  return apiFetch<void>(BUGBOUNTY_PROGRAM_ENDPOINTS.scopeItem(programId, scopeItemId), { method: "DELETE" });
}

export function classifyScopeValue(programId: string, data: ClassifyScopeRequestDto) {
  return apiFetch<ScopeClassificationResultDto>(BUGBOUNTY_PROGRAM_ENDPOINTS.classify(programId), {
    method: "POST",
    body: data,
  });
}

export function linkProgramTarget(programId: string, data: LinkProgramTargetRequestDto) {
  return apiFetch<BugBountyProgramTargetDto>(BUGBOUNTY_PROGRAM_ENDPOINTS.targets(programId), {
    method: "POST",
    body: data,
  });
}

export function unlinkProgramTarget(programId: string, targetId: string) {
  return apiFetch<void>(BUGBOUNTY_PROGRAM_ENDPOINTS.unlinkTarget(programId, targetId), { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Asset Inventory
// ---------------------------------------------------------------------------

export function listAssetInventory(query: AssetInventoryQueryDto) {
  return apiFetch<AssetInventoryEntryDto[]>(
    `${BUGBOUNTY_ASSET_ENDPOINTS.list}${toQueryString(query as Record<string, string | undefined>)}`,
  );
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

export function listBugBountyFindings(query: ListBugBountyFindingsQueryDto = {}) {
  return apiFetch<BugBountyFindingDto[]>(
    `${BUGBOUNTY_FINDING_ENDPOINTS.list}${toQueryString(query as Record<string, string | undefined>)}`,
  );
}

export function getBugBountyFinding(id: string) {
  return apiFetch<BugBountyFindingDto>(BUGBOUNTY_FINDING_ENDPOINTS.get(id));
}

export function createBugBountyFinding(data: CreateBugBountyFindingRequestDto) {
  return apiFetch<BugBountyFindingDto>(BUGBOUNTY_FINDING_ENDPOINTS.create, { method: "POST", body: data });
}

export function updateBugBountyFinding(id: string, data: UpdateBugBountyFindingRequestDto) {
  return apiFetch<BugBountyFindingDto>(BUGBOUNTY_FINDING_ENDPOINTS.update(id), { method: "PATCH", body: data });
}

export function deleteBugBountyFinding(id: string) {
  return apiFetch<void>(BUGBOUNTY_FINDING_ENDPOINTS.delete(id), { method: "DELETE" });
}

export function transitionBugBountyFindingStage(id: string, data: TransitionBugBountyFindingStageRequestDto) {
  return apiFetch<BugBountyFindingDto>(BUGBOUNTY_FINDING_ENDPOINTS.transitionStage(id), {
    method: "PATCH",
    body: data,
  });
}

export function checkDuplicateFinding(data: CheckDuplicateFindingRequestDto) {
  return apiFetch<CheckDuplicateFindingResultDto>(BUGBOUNTY_FINDING_ENDPOINTS.checkDuplicate, {
    method: "POST",
    body: data,
  });
}

// ---------------------------------------------------------------------------
// Bug Reports
// ---------------------------------------------------------------------------

export function listBugReports(query: ListBugReportsQueryDto = {}) {
  return apiFetch<BugReportDto[]>(
    `${BUG_REPORT_ENDPOINTS.list}${toQueryString(query as Record<string, string | undefined>)}`,
  );
}

export function getBugReport(id: string) {
  return apiFetch<BugReportDto>(BUG_REPORT_ENDPOINTS.get(id));
}

export function createBugReport(data: CreateBugReportRequestDto) {
  return apiFetch<BugReportDto>(BUG_REPORT_ENDPOINTS.create, { method: "POST", body: data });
}

export function updateBugReport(id: string, data: UpdateBugReportRequestDto) {
  return apiFetch<BugReportDto>(BUG_REPORT_ENDPOINTS.update(id), { method: "PATCH", body: data });
}

export function deleteBugReport(id: string) {
  return apiFetch<void>(BUG_REPORT_ENDPOINTS.delete(id), { method: "DELETE" });
}

export function submitBugReport(id: string, data: SubmitBugReportRequestDto) {
  return apiFetch<BugReportDto>(BUG_REPORT_ENDPOINTS.submit(id), { method: "POST", body: data });
}

export function generateBugReportDraft(id: string, data: GenerateBugReportDraftRequestDto = {}) {
  return apiFetch<GenerateBugReportDraftResultDto>(BUG_REPORT_ENDPOINTS.generateDraft(id), {
    method: "POST",
    body: data,
  });
}

export function renderBugReport(id: string) {
  return apiFetch<RenderedBugReportDto>(BUG_REPORT_ENDPOINTS.render(id));
}

export function exportBugReport(id: string, data: ExportBugReportRequestDto) {
  return apiFetch<ExportBugReportResultDto>(BUG_REPORT_ENDPOINTS.export(id), { method: "POST", body: data });
}

// ---------------------------------------------------------------------------
// Payload Library
// ---------------------------------------------------------------------------

export function listPayloadLibrary(query: ListPayloadLibraryQueryDto = {}) {
  return apiFetch<PayloadLibraryEntryDto[]>(
    `${PAYLOAD_LIBRARY_ENDPOINTS.list}${toQueryString(query as Record<string, string | undefined>)}`,
  );
}

export function getPayloadLibraryEntry(id: string) {
  return apiFetch<PayloadLibraryEntryDto>(PAYLOAD_LIBRARY_ENDPOINTS.get(id));
}

export function createPayloadLibraryEntry(data: CreatePayloadLibraryEntryRequestDto) {
  return apiFetch<PayloadLibraryEntryDto>(PAYLOAD_LIBRARY_ENDPOINTS.create, { method: "POST", body: data });
}

export function updatePayloadLibraryEntry(id: string, data: UpdatePayloadLibraryEntryRequestDto) {
  return apiFetch<PayloadLibraryEntryDto>(PAYLOAD_LIBRARY_ENDPOINTS.update(id), { method: "PATCH", body: data });
}

export function deletePayloadLibraryEntry(id: string) {
  return apiFetch<void>(PAYLOAD_LIBRARY_ENDPOINTS.delete(id), { method: "DELETE" });
}

export function explainPayload(id: string, data: ExplainPayloadRequestDto = {}) {
  return apiFetch<PayloadLibraryEntryDto>(PAYLOAD_LIBRARY_ENDPOINTS.explain(id), { method: "POST", body: data });
}

// ---------------------------------------------------------------------------
// Knowledge Base
// ---------------------------------------------------------------------------

export function listKnowledgeBaseNotes(query: ListKnowledgeBaseNotesQueryDto = {}) {
  return apiFetch<KnowledgeBaseNoteDto[]>(
    `${KNOWLEDGE_BASE_ENDPOINTS.list}${toQueryString(query as Record<string, string | undefined>)}`,
  );
}

export function getKnowledgeBaseNote(id: string) {
  return apiFetch<KnowledgeBaseNoteDto>(KNOWLEDGE_BASE_ENDPOINTS.get(id));
}

export function createKnowledgeBaseNote(data: CreateKnowledgeBaseNoteRequestDto) {
  return apiFetch<KnowledgeBaseNoteDto>(KNOWLEDGE_BASE_ENDPOINTS.create, { method: "POST", body: data });
}

export function updateKnowledgeBaseNote(id: string, data: UpdateKnowledgeBaseNoteRequestDto) {
  return apiFetch<KnowledgeBaseNoteDto>(KNOWLEDGE_BASE_ENDPOINTS.update(id), { method: "PATCH", body: data });
}

export function deleteKnowledgeBaseNote(id: string) {
  return apiFetch<void>(KNOWLEDGE_BASE_ENDPOINTS.delete(id), { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Bookmarks
// ---------------------------------------------------------------------------

export function listBookmarks(query: ListBookmarksQueryDto = {}) {
  return apiFetch<BookmarkDto[]>(
    `${BOOKMARK_ENDPOINTS.list}${toQueryString(query as Record<string, string | undefined>)}`,
  );
}

export function createBookmark(data: CreateBookmarkRequestDto) {
  return apiFetch<BookmarkDto>(BOOKMARK_ENDPOINTS.create, { method: "POST", body: data });
}

export function deleteBookmark(id: string) {
  return apiFetch<void>(BOOKMARK_ENDPOINTS.delete(id), { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Dashboard + Statistics
// ---------------------------------------------------------------------------

export function getBugBountyDashboard() {
  return apiFetch<BugBountyDashboardDto>(BUGBOUNTY_DASHBOARD_ENDPOINTS.summary);
}

export function getBugBountyStatistics() {
  return apiFetch<BugBountyStatisticsDto>(BUGBOUNTY_DASHBOARD_ENDPOINTS.statistics);
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

export function listCalendarEvents(query: ListCalendarEventsQueryDto = {}) {
  return apiFetch<BugBountyCalendarEventDto[]>(
    `${BUGBOUNTY_CALENDAR_ENDPOINTS.list}${toQueryString(query as Record<string, string | undefined>)}`,
  );
}

export function createCalendarEvent(data: CreateCalendarEventRequestDto) {
  return apiFetch<BugBountyCalendarEventDto>(BUGBOUNTY_CALENDAR_ENDPOINTS.create, { method: "POST", body: data });
}

export function updateCalendarEvent(id: string, data: UpdateCalendarEventRequestDto) {
  return apiFetch<BugBountyCalendarEventDto>(BUGBOUNTY_CALENDAR_ENDPOINTS.update(id), {
    method: "PATCH",
    body: data,
  });
}

export function deleteCalendarEvent(id: string) {
  return apiFetch<void>(BUGBOUNTY_CALENDAR_ENDPOINTS.delete(id), { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export function listNotifications(query: ListNotificationsQueryDto = {}) {
  return apiFetch<BugBountyNotificationDto[]>(
    `${BUGBOUNTY_NOTIFICATION_ENDPOINTS.list}${toQueryString(query as Record<string, boolean | undefined>)}`,
  );
}

export function markNotificationRead(id: string) {
  return apiFetch<BugBountyNotificationDto>(BUGBOUNTY_NOTIFICATION_ENDPOINTS.markRead(id), { method: "POST" });
}

export function markAllNotificationsRead() {
  return apiFetch<{ count: number }>(BUGBOUNTY_NOTIFICATION_ENDPOINTS.markAllRead, { method: "POST" });
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export function searchBugBounty(q: string) {
  return apiFetch<BugBountySearchResultDto[]>(`${BUGBOUNTY_SEARCH_ENDPOINTS.search}${toQueryString({ q })}`);
}
