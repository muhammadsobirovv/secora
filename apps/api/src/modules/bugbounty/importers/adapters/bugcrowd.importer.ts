import { Injectable } from '@nestjs/common';
import type { ScopeItemType } from '@pentesthub/shared';
import type {
  ParsedProgramImport,
  ParsedScopeItem,
  ProgramImporter,
} from '../program-importer.interface.js';
import { ProgramImportParseError } from '../program-importer.interface.js';

interface BugcrowdTarget {
  name?: string;
  category?: string;
  target_type?: string;
  in_scope?: boolean;
  description?: string;
}

interface BugcrowdTargetGroup {
  name?: string;
  targets?: BugcrowdTarget[];
}

interface BugcrowdProgramShape {
  name?: string;
  code?: string;
  briefing?: { policy?: string; disclosure_policy?: string };
  target_groups?: BugcrowdTargetGroup[];
}

const CATEGORY_MAP: Record<string, ScopeItemType> = {
  website: 'URL',
  api: 'API',
  mobile: 'MOBILE_APP',
  android: 'MOBILE_APP',
  ios: 'MOBILE_APP',
  ip_address: 'IP_RANGE',
  network_range: 'CIDR',
  cidr: 'CIDR',
  cloud: 'CLOUD_ASSET',
  hardware: 'CLOUD_ASSET',
  other: 'CLOUD_ASSET',
};

@Injectable()
export class BugcrowdImporter implements ProgramImporter {
  readonly source = 'BUGCROWD' as const;

  parse(raw: string): ParsedProgramImport {
    let parsed: BugcrowdProgramShape;
    try {
      parsed = JSON.parse(raw) as BugcrowdProgramShape;
    } catch (error) {
      throw new ProgramImportParseError(
        this.source,
        error instanceof Error ? error.message : 'invalid JSON',
      );
    }

    const name = parsed.name ?? parsed.code;
    if (!name) {
      throw new ProgramImportParseError(
        this.source,
        'missing "name"/"code" field',
      );
    }

    const warnings: string[] = [];
    const scopeItems: ParsedScopeItem[] = [];
    for (const group of parsed.target_groups ?? []) {
      for (const target of group.targets ?? []) {
        if (!target.name) {
          warnings.push('Skipped a target with no name.');
          continue;
        }
        const categoryKey = (
          target.target_type ??
          target.category ??
          ''
        ).toLowerCase();
        let type = CATEGORY_MAP[categoryKey];
        if (!type) {
          // A bare wildcard-looking name with no explicit category is a
          // common Bugcrowd export shape for "website" targets.
          type = target.name.startsWith('*.') ? 'WILDCARD' : 'URL';
          if (categoryKey) {
            warnings.push(
              `Unmapped Bugcrowd target_type "${categoryKey}" for "${target.name}" — guessed ${type}.`,
            );
          }
        }
        scopeItems.push({
          type,
          pattern: target.name,
          classification:
            target.in_scope === false
              ? 'OUT_OF_SCOPE'
              : target.in_scope === true
                ? 'IN_SCOPE'
                : 'UNKNOWN',
          notes: target.description,
        });
      }
    }

    return {
      name,
      platform: 'BUGCROWD',
      url: parsed.code ? `https://bugcrowd.com/${parsed.code}` : undefined,
      rulesMarkdown: parsed.briefing?.policy,
      disclosurePolicy: parsed.briefing?.disclosure_policy,
      scopeItems,
      warnings,
    };
  }
}
