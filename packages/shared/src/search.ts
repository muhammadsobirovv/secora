export type SearchResultType = "PROJECT" | "TARGET" | "NOTE" | "EVIDENCE";

export interface SearchResultDto {
  type: SearchResultType;
  id: string;
  projectId: string | null;
  title: string;
  snippet: string | null;
}

export interface SearchQueryDto {
  q: string;
}

/// Module 15 — Global Search unification (task #339). Before this pass,
/// `/search` (Module 2's SearchResultType, above — PROJECT/TARGET/NOTE/
/// EVIDENCE) and `/bugbounty/search` (BugBountySearchResultType in
/// bugbounty.ts — PROGRAM/BUGBOUNTY_FINDING/BUG_REPORT/PAYLOAD/
/// KNOWLEDGE_BASE_NOTE/AI_CHAT/TAG/TASK) were two independent endpoints
/// with incompatible result shapes (one has `projectId`, one doesn't) —
/// exactly the fragmentation docs/adr/0002-workspace-foundation-module.md
/// Decision 10 says future modules should have avoided by building on the
/// `SearchService` port instead of a parallel stack. This type is the
/// unifying superset, used by the new `GET /search/global` endpoint
/// (apps/api/src/modules/search/), which merges both existing handlers'
/// results plus three previously-unsearched Module 13/15 entity types
/// (PLUGIN, WORKFLOW, SECURITY_ADVISORY) rather than rewriting either
/// existing handler or its consumers — `/search` and `/bugbounty/search`
/// keep working unmodified for the callers (web, mobile) already wired to
/// them; see that endpoint's doc comment for the still-open follow-up
/// (migrating those callers onto the unified endpoint).
export type GlobalSearchResultType =
  | SearchResultType
  | "PROGRAM"
  | "BUGBOUNTY_FINDING"
  | "BUG_REPORT"
  | "PAYLOAD"
  | "KNOWLEDGE_BASE_NOTE"
  | "AI_CHAT"
  | "TAG"
  | "TASK"
  | "PLUGIN"
  | "WORKFLOW"
  | "SECURITY_ADVISORY";

export interface GlobalSearchResultDto {
  type: GlobalSearchResultType;
  id: string;
  /// Only populated for the four project-scoped types (PROJECT/TARGET/
  /// NOTE/EVIDENCE) that `SearchResultDto` already carries it for — every
  /// other type is workspace/organization-scoped with no owning project,
  /// same "absent means not applicable to this type" convention
  /// `EmailChannelConfig.toAddress` uses elsewhere in this package.
  projectId: string | null;
  title: string;
  snippet: string | null;
}
