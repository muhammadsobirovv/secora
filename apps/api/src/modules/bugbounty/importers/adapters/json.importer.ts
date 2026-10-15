import { Injectable } from '@nestjs/common';
import type {
  BugBountyPlatform,
  ScopeClassification,
  ScopeItemType,
} from '@pentesthub/shared';
import type {
  ParsedProgramImport,
  ParsedScopeItem,
  ProgramImporter,
} from '../program-importer.interface.js';
import { ProgramImportParseError } from '../program-importer.interface.js';

const VALID_PLATFORMS: BugBountyPlatform[] = [
  'HACKERONE',
  'BUGCROWD',
  'INTIGRITI',
  'YESWEHACK',
  'SYNACK',
  'INTERNAL',
  'PRIVATE',
  'CUSTOM',
];
const VALID_TYPES: ScopeItemType[] = [
  'DOMAIN',
  'WILDCARD',
  'URL',
  'MOBILE_APP',
  'API',
  'CIDR',
  'IP_RANGE',
  'ASN',
  'CLOUD_ASSET',
  // Module 9 additions
  'HOST',
  'INTERNAL_ASSET',
  'GITHUB_ORG',
  'THIRD_PARTY',
];
const VALID_CLASSIFICATIONS: ScopeClassification[] = [
  'IN_SCOPE',
  'OUT_OF_SCOPE',
  'UNKNOWN',
  // Module 9 additions
  'REVIEW_NEEDED',
  'DEPRECATED',
];

interface JsonScopeItemShape {
  type?: string;
  pattern?: string;
  classification?: string;
  notes?: string;
}

interface JsonProgramShape {
  name?: string;
  platform?: string;
  organization?: string;
  url?: string;
  rulesMarkdown?: string;
  disclosurePolicy?: string;
  tags?: string[];
  scopeItems?: JsonScopeItemShape[];
}

/// The "our own internal shape" importer — round-trips
/// ImportProgramResultDto-adjacent JSON (e.g. an export from one
/// Secora workspace re-imported into another) with light validation,
/// rather than a platform-specific normalization like the other four
/// adapters. Also the reasonable target format for any platform not on
/// the named list (YesWeHack/Synack/Internal/Private/Custom) — export to
/// this shape by hand or script, then import here.
@Injectable()
export class JsonImporter implements ProgramImporter {
  readonly source = 'JSON' as const;

  parse(raw: string): ParsedProgramImport {
    let parsed: JsonProgramShape;
    try {
      parsed = JSON.parse(raw) as JsonProgramShape;
    } catch (error) {
      throw new ProgramImportParseError(
        this.source,
        error instanceof Error ? error.message : 'invalid JSON',
      );
    }

    if (!parsed.name) {
      throw new ProgramImportParseError(this.source, 'missing "name" field');
    }

    const warnings: string[] = [];
    const platform = VALID_PLATFORMS.includes(
      parsed.platform as BugBountyPlatform,
    )
      ? (parsed.platform as BugBountyPlatform)
      : 'CUSTOM';
    if (
      parsed.platform &&
      platform === 'CUSTOM' &&
      parsed.platform !== 'CUSTOM'
    ) {
      warnings.push(
        `Unknown platform "${parsed.platform}" — defaulted to CUSTOM.`,
      );
    }

    const scopeItems: ParsedScopeItem[] = [];
    for (const item of parsed.scopeItems ?? []) {
      if (!item.pattern) {
        warnings.push('Skipped a scope item with no pattern.');
        continue;
      }
      const type = VALID_TYPES.includes(item.type as ScopeItemType)
        ? (item.type as ScopeItemType)
        : undefined;
      if (!type) {
        warnings.push(
          `Skipped "${item.pattern}" — invalid or missing scope item type "${item.type ?? ''}".`,
        );
        continue;
      }
      const classification = VALID_CLASSIFICATIONS.includes(
        item.classification as ScopeClassification,
      )
        ? (item.classification as ScopeClassification)
        : 'UNKNOWN';
      scopeItems.push({
        type,
        pattern: item.pattern,
        classification,
        notes: item.notes,
      });
    }

    return {
      name: parsed.name,
      platform,
      organization: parsed.organization,
      url: parsed.url,
      rulesMarkdown: parsed.rulesMarkdown,
      disclosurePolicy: parsed.disclosurePolicy,
      tags: parsed.tags,
      scopeItems,
      warnings,
    };
  }
}
