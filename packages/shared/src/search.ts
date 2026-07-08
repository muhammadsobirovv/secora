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
