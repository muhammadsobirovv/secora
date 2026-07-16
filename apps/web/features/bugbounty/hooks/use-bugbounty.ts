"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AssetInventoryQueryDto,
  CheckDuplicateFindingRequestDto,
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
  GenerateBugReportDraftRequestDto,
  ImportProgramRequestDto,
  LinkProgramTargetRequestDto,
  ListBookmarksQueryDto,
  ListBugBountyFindingsQueryDto,
  ListBugBountyProgramsQueryDto,
  ListBugReportsQueryDto,
  ListCalendarEventsQueryDto,
  ListKnowledgeBaseNotesQueryDto,
  ListNotificationsQueryDto,
  ListPayloadLibraryQueryDto,
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
import * as bugBountyApi from "@/lib/api/bugbounty";

export const bugBountyKeys = {
  all: ["bugbounty"] as const,
  programs: (query: ListBugBountyProgramsQueryDto = {}) => ["bugbounty", "programs", query] as const,
  program: (id: string) => ["bugbounty", "programs", "detail", id] as const,
  assets: (query: AssetInventoryQueryDto) => ["bugbounty", "assets", query] as const,
  findings: (query: ListBugBountyFindingsQueryDto = {}) => ["bugbounty", "findings", query] as const,
  finding: (id: string) => ["bugbounty", "findings", "detail", id] as const,
  reports: (query: ListBugReportsQueryDto = {}) => ["bugbounty", "reports", query] as const,
  report: (id: string) => ["bugbounty", "reports", "detail", id] as const,
  reportRender: (id: string) => ["bugbounty", "reports", "render", id] as const,
  payloads: (query: ListPayloadLibraryQueryDto = {}) => ["bugbounty", "payloads", query] as const,
  payload: (id: string) => ["bugbounty", "payloads", "detail", id] as const,
  notes: (query: ListKnowledgeBaseNotesQueryDto = {}) => ["bugbounty", "notes", query] as const,
  note: (id: string) => ["bugbounty", "notes", "detail", id] as const,
  bookmarks: (query: ListBookmarksQueryDto = {}) => ["bugbounty", "bookmarks", query] as const,
  dashboard: ["bugbounty", "dashboard"] as const,
  statistics: ["bugbounty", "statistics"] as const,
  calendar: (query: ListCalendarEventsQueryDto = {}) => ["bugbounty", "calendar", query] as const,
  notifications: (query: ListNotificationsQueryDto = {}) => ["bugbounty", "notifications", query] as const,
  search: (q: string) => ["bugbounty", "search", q] as const,
};

function useInvalidateBugBounty() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: bugBountyKeys.all });
}

// ---------------------------------------------------------------------------
// Programs
// ---------------------------------------------------------------------------

export function useBugBountyPrograms(query: ListBugBountyProgramsQueryDto = {}) {
  return useQuery({
    queryKey: bugBountyKeys.programs(query),
    queryFn: () => bugBountyApi.listBugBountyPrograms(query),
  });
}

export function useBugBountyProgram(id: string) {
  return useQuery({
    queryKey: bugBountyKeys.program(id),
    queryFn: () => bugBountyApi.getBugBountyProgram(id),
    enabled: Boolean(id),
  });
}

export function useCreateBugBountyProgram() {
  const invalidate = useInvalidateBugBounty();
  return useMutation({
    mutationFn: (data: CreateBugBountyProgramRequestDto) => bugBountyApi.createBugBountyProgram(data),
    onSuccess: invalidate,
  });
}

export function useUpdateBugBountyProgram(id: string) {
  const invalidate = useInvalidateBugBounty();
  return useMutation({
    mutationFn: (data: UpdateBugBountyProgramRequestDto) => bugBountyApi.updateBugBountyProgram(id, data),
    onSuccess: invalidate,
  });
}

export function useDeleteBugBountyProgram() {
  const invalidate = useInvalidateBugBounty();
  return useMutation({
    mutationFn: (id: string) => bugBountyApi.deleteBugBountyProgram(id),
    onSuccess: invalidate,
  });
}

export function useImportBugBountyProgram() {
  const invalidate = useInvalidateBugBounty();
  return useMutation({
    mutationFn: (data: ImportProgramRequestDto) => bugBountyApi.importBugBountyProgram(data),
    onSuccess: invalidate,
  });
}

export function useAddScopeItem(programId: string) {
  const invalidate = useInvalidateBugBounty();
  return useMutation({
    mutationFn: (data: CreateScopeItemRequestDto) => bugBountyApi.addScopeItem(programId, data),
    onSuccess: invalidate,
  });
}

export function useUpdateScopeItem(programId: string) {
  const invalidate = useInvalidateBugBounty();
  return useMutation({
    mutationFn: ({ scopeItemId, data }: { scopeItemId: string; data: UpdateScopeItemRequestDto }) =>
      bugBountyApi.updateScopeItem(programId, scopeItemId, data),
    onSuccess: invalidate,
  });
}

export function useRemoveScopeItem(programId: string) {
  const invalidate = useInvalidateBugBounty();
  return useMutation({
    mutationFn: (scopeItemId: string) => bugBountyApi.removeScopeItem(programId, scopeItemId),
    onSuccess: invalidate,
  });
}

export function useClassifyScopeValue(programId: string) {
  return useMutation({
    mutationFn: (data: ClassifyScopeRequestDto) => bugBountyApi.classifyScopeValue(programId, data),
  });
}

export function useLinkProgramTarget(programId: string) {
  const invalidate = useInvalidateBugBounty();
  return useMutation({
    mutationFn: (data: LinkProgramTargetRequestDto) => bugBountyApi.linkProgramTarget(programId, data),
    onSuccess: invalidate,
  });
}

export function useUnlinkProgramTarget(programId: string) {
  const invalidate = useInvalidateBugBounty();
  return useMutation({
    mutationFn: (targetId: string) => bugBountyApi.unlinkProgramTarget(programId, targetId),
    onSuccess: invalidate,
  });
}

// ---------------------------------------------------------------------------
// Asset Inventory
// ---------------------------------------------------------------------------

export function useAssetInventory(query: AssetInventoryQueryDto) {
  return useQuery({
    queryKey: bugBountyKeys.assets(query),
    queryFn: () => bugBountyApi.listAssetInventory(query),
    enabled: Boolean(query.programId || query.projectId),
  });
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

export function useBugBountyFindings(query: ListBugBountyFindingsQueryDto = {}) {
  return useQuery({
    queryKey: bugBountyKeys.findings(query),
    queryFn: () => bugBountyApi.listBugBountyFindings(query),
  });
}

export function useBugBountyFinding(id: string) {
  return useQuery({
    queryKey: bugBountyKeys.finding(id),
    queryFn: () => bugBountyApi.getBugBountyFinding(id),
    enabled: Boolean(id),
  });
}

export function useCreateBugBountyFinding() {
  const invalidate = useInvalidateBugBounty();
  return useMutation({
    mutationFn: (data: CreateBugBountyFindingRequestDto) => bugBountyApi.createBugBountyFinding(data),
    onSuccess: invalidate,
  });
}

export function useUpdateBugBountyFinding(id: string) {
  const invalidate = useInvalidateBugBounty();
  return useMutation({
    mutationFn: (data: UpdateBugBountyFindingRequestDto) => bugBountyApi.updateBugBountyFinding(id, data),
    onSuccess: invalidate,
  });
}

export function useDeleteBugBountyFinding() {
  const invalidate = useInvalidateBugBounty();
  return useMutation({
    mutationFn: (id: string) => bugBountyApi.deleteBugBountyFinding(id),
    onSuccess: invalidate,
  });
}

export function useTransitionBugBountyFindingStage(id: string) {
  const invalidate = useInvalidateBugBounty();
  return useMutation({
    mutationFn: (data: TransitionBugBountyFindingStageRequestDto) =>
      bugBountyApi.transitionBugBountyFindingStage(id, data),
    onSuccess: invalidate,
  });
}

export function useCheckDuplicateFinding() {
  return useMutation({
    mutationFn: (data: CheckDuplicateFindingRequestDto) => bugBountyApi.checkDuplicateFinding(data),
  });
}

// ---------------------------------------------------------------------------
// Bug Reports
// ---------------------------------------------------------------------------

export function useBugReports(query: ListBugReportsQueryDto = {}) {
  return useQuery({
    queryKey: bugBountyKeys.reports(query),
    queryFn: () => bugBountyApi.listBugReports(query),
  });
}

export function useBugReport(id: string) {
  return useQuery({
    queryKey: bugBountyKeys.report(id),
    queryFn: () => bugBountyApi.getBugReport(id),
    enabled: Boolean(id),
  });
}

export function useCreateBugReport() {
  const invalidate = useInvalidateBugBounty();
  return useMutation({
    mutationFn: (data: CreateBugReportRequestDto) => bugBountyApi.createBugReport(data),
    onSuccess: invalidate,
  });
}

export function useUpdateBugReport(id: string) {
  const invalidate = useInvalidateBugBounty();
  return useMutation({
    mutationFn: (data: UpdateBugReportRequestDto) => bugBountyApi.updateBugReport(id, data),
    onSuccess: invalidate,
  });
}

export function useDeleteBugReport() {
  const invalidate = useInvalidateBugBounty();
  return useMutation({
    mutationFn: (id: string) => bugBountyApi.deleteBugReport(id),
    onSuccess: invalidate,
  });
}

export function useSubmitBugReport(id: string) {
  const invalidate = useInvalidateBugBounty();
  return useMutation({
    mutationFn: (data: SubmitBugReportRequestDto) => bugBountyApi.submitBugReport(id, data),
    onSuccess: invalidate,
  });
}

export function useGenerateBugReportDraft(id: string) {
  const invalidate = useInvalidateBugBounty();
  return useMutation({
    mutationFn: (data: GenerateBugReportDraftRequestDto = {}) => bugBountyApi.generateBugReportDraft(id, data),
    onSuccess: invalidate,
  });
}

export function useRenderBugReport(id: string, enabled: boolean) {
  return useQuery({
    queryKey: bugBountyKeys.reportRender(id),
    queryFn: () => bugBountyApi.renderBugReport(id),
    enabled: Boolean(id) && enabled,
  });
}

export function useExportBugReport(id: string) {
  return useMutation({
    mutationFn: (data: ExportBugReportRequestDto) => bugBountyApi.exportBugReport(id, data),
  });
}

// ---------------------------------------------------------------------------
// Payload Library
// ---------------------------------------------------------------------------

export function usePayloadLibrary(query: ListPayloadLibraryQueryDto = {}) {
  return useQuery({
    queryKey: bugBountyKeys.payloads(query),
    queryFn: () => bugBountyApi.listPayloadLibrary(query),
  });
}

export function usePayloadLibraryEntry(id: string) {
  return useQuery({
    queryKey: bugBountyKeys.payload(id),
    queryFn: () => bugBountyApi.getPayloadLibraryEntry(id),
    enabled: Boolean(id),
  });
}

export function useCreatePayloadLibraryEntry() {
  const invalidate = useInvalidateBugBounty();
  return useMutation({
    mutationFn: (data: CreatePayloadLibraryEntryRequestDto) => bugBountyApi.createPayloadLibraryEntry(data),
    onSuccess: invalidate,
  });
}

export function useUpdatePayloadLibraryEntry(id: string) {
  const invalidate = useInvalidateBugBounty();
  return useMutation({
    mutationFn: (data: UpdatePayloadLibraryEntryRequestDto) => bugBountyApi.updatePayloadLibraryEntry(id, data),
    onSuccess: invalidate,
  });
}

export function useDeletePayloadLibraryEntry() {
  const invalidate = useInvalidateBugBounty();
  return useMutation({
    mutationFn: (id: string) => bugBountyApi.deletePayloadLibraryEntry(id),
    onSuccess: invalidate,
  });
}

export function useExplainPayload(id: string) {
  const invalidate = useInvalidateBugBounty();
  return useMutation({
    mutationFn: (data: ExplainPayloadRequestDto = {}) => bugBountyApi.explainPayload(id, data),
    onSuccess: invalidate,
  });
}

// ---------------------------------------------------------------------------
// Knowledge Base
// ---------------------------------------------------------------------------

export function useKnowledgeBaseNotes(query: ListKnowledgeBaseNotesQueryDto = {}) {
  return useQuery({
    queryKey: bugBountyKeys.notes(query),
    queryFn: () => bugBountyApi.listKnowledgeBaseNotes(query),
  });
}

export function useKnowledgeBaseNote(id: string) {
  return useQuery({
    queryKey: bugBountyKeys.note(id),
    queryFn: () => bugBountyApi.getKnowledgeBaseNote(id),
    enabled: Boolean(id),
  });
}

export function useCreateKnowledgeBaseNote() {
  const invalidate = useInvalidateBugBounty();
  return useMutation({
    mutationFn: (data: CreateKnowledgeBaseNoteRequestDto) => bugBountyApi.createKnowledgeBaseNote(data),
    onSuccess: invalidate,
  });
}

export function useUpdateKnowledgeBaseNote(id: string) {
  const invalidate = useInvalidateBugBounty();
  return useMutation({
    mutationFn: (data: UpdateKnowledgeBaseNoteRequestDto) => bugBountyApi.updateKnowledgeBaseNote(id, data),
    onSuccess: invalidate,
  });
}

export function useDeleteKnowledgeBaseNote() {
  const invalidate = useInvalidateBugBounty();
  return useMutation({
    mutationFn: (id: string) => bugBountyApi.deleteKnowledgeBaseNote(id),
    onSuccess: invalidate,
  });
}

// ---------------------------------------------------------------------------
// Bookmarks
// ---------------------------------------------------------------------------

export function useBookmarks(query: ListBookmarksQueryDto = {}) {
  return useQuery({
    queryKey: bugBountyKeys.bookmarks(query),
    queryFn: () => bugBountyApi.listBookmarks(query),
  });
}

export function useCreateBookmark() {
  const invalidate = useInvalidateBugBounty();
  return useMutation({
    mutationFn: (data: CreateBookmarkRequestDto) => bugBountyApi.createBookmark(data),
    onSuccess: invalidate,
  });
}

export function useDeleteBookmark() {
  const invalidate = useInvalidateBugBounty();
  return useMutation({
    mutationFn: (id: string) => bugBountyApi.deleteBookmark(id),
    onSuccess: invalidate,
  });
}

// ---------------------------------------------------------------------------
// Dashboard + Statistics
// ---------------------------------------------------------------------------

export function useBugBountyDashboard() {
  return useQuery({
    queryKey: bugBountyKeys.dashboard,
    queryFn: () => bugBountyApi.getBugBountyDashboard(),
  });
}

export function useBugBountyStatistics() {
  return useQuery({
    queryKey: bugBountyKeys.statistics,
    queryFn: () => bugBountyApi.getBugBountyStatistics(),
  });
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

export function useCalendarEvents(query: ListCalendarEventsQueryDto = {}) {
  return useQuery({
    queryKey: bugBountyKeys.calendar(query),
    queryFn: () => bugBountyApi.listCalendarEvents(query),
  });
}

export function useCreateCalendarEvent() {
  const invalidate = useInvalidateBugBounty();
  return useMutation({
    mutationFn: (data: CreateCalendarEventRequestDto) => bugBountyApi.createCalendarEvent(data),
    onSuccess: invalidate,
  });
}

export function useUpdateCalendarEvent(id: string) {
  const invalidate = useInvalidateBugBounty();
  return useMutation({
    mutationFn: (data: UpdateCalendarEventRequestDto) => bugBountyApi.updateCalendarEvent(id, data),
    onSuccess: invalidate,
  });
}

export function useDeleteCalendarEvent() {
  const invalidate = useInvalidateBugBounty();
  return useMutation({
    mutationFn: (id: string) => bugBountyApi.deleteCalendarEvent(id),
    onSuccess: invalidate,
  });
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

const NOTIFICATIONS_POLL_MS = 30_000;

export function useBugBountyNotifications(query: ListNotificationsQueryDto = {}) {
  return useQuery({
    queryKey: bugBountyKeys.notifications(query),
    queryFn: () => bugBountyApi.listNotifications(query),
    refetchInterval: NOTIFICATIONS_POLL_MS,
  });
}

export function useMarkNotificationRead() {
  const invalidate = useInvalidateBugBounty();
  return useMutation({
    mutationFn: (id: string) => bugBountyApi.markNotificationRead(id),
    onSuccess: invalidate,
  });
}

export function useMarkAllNotificationsRead() {
  const invalidate = useInvalidateBugBounty();
  return useMutation({
    mutationFn: () => bugBountyApi.markAllNotificationsRead(),
    onSuccess: invalidate,
  });
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export function useBugBountySearch(q: string) {
  return useQuery({
    queryKey: bugBountyKeys.search(q),
    queryFn: () => bugBountyApi.searchBugBounty(q),
    enabled: q.trim().length > 1,
  });
}
