import { Injectable } from '@nestjs/common';
import type { ScopeItemType } from '@pentesthub/shared';
import type {
  ParsedProgramImport,
  ParsedScopeItem,
  ProgramImporter,
} from '../program-importer.interface.js';
import { ProgramImportParseError } from '../program-importer.interface.js';

interface IntigritiDomain {
  endpoint?: string;
  type?: string;
  inScope?: boolean;
  description?: string;
}

interface IntigritiProgramShape {
  name?: string;
  companyHandle?: string;
  handle?: string;
  policy?: string;
  disclosurePolicy?: string;
  domains?: IntigritiDomain[];
}

const TYPE_MAP: Record<string, ScopeItemType> = {
  url: 'URL',
  wildcard: 'WILDCARD',
  api: 'API',
  mobile: 'MOBILE_APP',
  android: 'MOBILE_APP',
  ios: 'MOBILE_APP',
  cidr: 'CIDR',
  ip: 'IP_RANGE',
  iprange: 'IP_RANGE',
  cloud: 'CLOUD_ASSET',
  other: 'CLOUD_ASSET',
};

@Injectable()
export class IntigritiImporter implements ProgramImporter {
  readonly source = 'INTIGRITI' as const;

  parse(raw: string): ParsedProgramImport {
    let parsed: IntigritiProgramShape;
    try {
      parsed = JSON.parse(raw) as IntigritiProgramShape;
    } catch (error) {
      throw new ProgramImportParseError(
        this.source,
        error instanceof Error ? error.message : 'invalid JSON',
      );
    }

    const name = parsed.name ?? parsed.companyHandle ?? parsed.handle;
    if (!name) {
      throw new ProgramImportParseError(
        this.source,
        'missing "name"/"companyHandle" field',
      );
    }

    const warnings: string[] = [];
    const scopeItems: ParsedScopeItem[] = [];
    for (const domain of parsed.domains ?? []) {
      if (!domain.endpoint) {
        warnings.push('Skipped a domain entry with no endpoint.');
        continue;
      }
      const typeKey = (domain.type ?? '').toLowerCase();
      let type = TYPE_MAP[typeKey];
      if (!type) {
        type = domain.endpoint.startsWith('*.') ? 'WILDCARD' : 'URL';
        if (typeKey) {
          warnings.push(
            `Unmapped Intigriti type "${typeKey}" for "${domain.endpoint}" — guessed ${type}.`,
          );
        }
      }
      scopeItems.push({
        type,
        pattern: domain.endpoint,
        classification:
          domain.inScope === false
            ? 'OUT_OF_SCOPE'
            : domain.inScope === true
              ? 'IN_SCOPE'
              : 'UNKNOWN',
        notes: domain.description,
      });
    }

    return {
      name,
      platform: 'INTIGRITI',
      url: parsed.companyHandle
        ? `https://app.intigriti.com/programs/${parsed.companyHandle}`
        : undefined,
      rulesMarkdown: parsed.policy,
      disclosurePolicy: parsed.disclosurePolicy,
      scopeItems,
      warnings,
    };
  }
}
