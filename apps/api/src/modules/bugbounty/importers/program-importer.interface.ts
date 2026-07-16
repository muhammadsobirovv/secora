import type {
  BugBountyPlatform,
  ProgramImportSource,
  ScopeClassification,
  ScopeItemType,
} from '@pentesthub/shared';

export interface ParsedScopeItem {
  type: ScopeItemType;
  pattern: string;
  classification: ScopeClassification;
  notes?: string;
}

export interface ParsedProgramImport {
  name: string;
  platform: BugBountyPlatform;
  organization?: string;
  url?: string;
  rulesMarkdown?: string;
  disclosurePolicy?: string;
  tags?: string[];
  scopeItems: ParsedScopeItem[];
  /// Rows the parser couldn't confidently normalize (unknown asset_type,
  /// malformed line, ...) — surfaced to the caller (ImportProgramResultDto
  /// .warnings) rather than silently dropped or thrown, so a partially
  /// recognized export still imports the part that worked.
  warnings: string[];
}

export class ProgramImportParseError extends Error {
  constructor(source: ProgramImportSource, message: string) {
    super(`Failed to parse ${source} program import: ${message}`);
    this.name = 'ProgramImportParseError';
  }
}

/// One adapter per supported import source — same "constructor injection
/// + Map" registry shape as AiProviderRegistryService (Module 5) and
/// ScannerRunnerRegistry (Module 4). Every adapter is a pure function over
/// a raw string in, ParsedProgramImport out; no adapter touches the
/// database or makes a network call — ImportBugBountyProgramCommand does
/// the actual persistence, so these stay trivially unit-testable.
export interface ProgramImporter {
  readonly source: ProgramImportSource;
  parse(raw: string): ParsedProgramImport;
}
