export interface LegalSection {
  heading: string;
  paragraphs?: string[];
  list?: string[];
}

export interface LegalDocumentContent {
  title: string;
  intro: string;
  sections: LegalSection[];
}

export type LegalPageKind = "terms" | "aup" | "privacy" | "security";

export type LegalCatalog = Record<LegalPageKind, LegalDocumentContent>;
