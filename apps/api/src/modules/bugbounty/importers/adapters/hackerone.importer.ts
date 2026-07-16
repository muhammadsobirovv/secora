import { Injectable } from '@nestjs/common';
import type { ScopeItemType } from '@pentesthub/shared';
import type {
  ParsedProgramImport,
  ParsedScopeItem,
  ProgramImporter,
} from '../program-importer.interface.js';
import { ProgramImportParseError } from '../program-importer.interface.js';

interface H1StructuredScope {
  asset_identifier?: string;
  asset_type?: string;
  eligible_for_submission?: boolean;
  eligible_for_bounty?: boolean;
  instruction?: string;
}

interface H1ProgramShape {
  name?: string;
  handle?: string;
  offers_bounties?: boolean;
  policy?: string;
  submission_state?: string;
  structured_scopes?: H1StructuredScope[];
  // JSON:API-nested shape some exports use instead of the flat one above.
  data?: {
    attributes?: {
      name?: string;
      handle?: string;
      offers_bounties?: boolean;
      policy?: string;
    };
    relationships?: {
      structured_scopes?: { data?: { attributes?: H1StructuredScope }[] };
    };
  };
}

/// HackerOne's `asset_type` vocabulary is much finer-grained than our
/// ScopeItemType — everything without a clean equivalent (source code,
/// hardware, social handles, executables, ...) buckets into CLOUD_ASSET
/// with a warning naming the original type, rather than being dropped.
const ASSET_TYPE_MAP: Record<string, ScopeItemType> = {
  URL: 'URL',
  WILDCARD: 'WILDCARD',
  CIDR: 'CIDR',
  IP_ADDRESS: 'IP_RANGE',
  IP_ADDRESS_V4: 'IP_RANGE',
  IP_ADDRESS_V6: 'IP_RANGE',
  GOOGLE_PLAY_APP_ID: 'MOBILE_APP',
  OTHER_APK: 'MOBILE_APP',
  APPLE_STORE_APP_ID: 'MOBILE_APP',
  TESTFLIGHT: 'MOBILE_APP',
};

@Injectable()
export class HackerOneImporter implements ProgramImporter {
  readonly source = 'HACKERONE' as const;

  parse(raw: string): ParsedProgramImport {
    let parsed: H1ProgramShape;
    try {
      parsed = JSON.parse(raw) as H1ProgramShape;
    } catch (error) {
      throw new ProgramImportParseError(
        this.source,
        error instanceof Error ? error.message : 'invalid JSON',
      );
    }

    const attributes = parsed.data?.attributes ?? parsed;
    const name = attributes.name ?? attributes.handle;
    if (!name) {
      throw new ProgramImportParseError(
        this.source,
        'missing "name"/"handle" field',
      );
    }

    const rawScopes =
      parsed.data?.relationships?.structured_scopes?.data?.map(
        (d) => d.attributes ?? {},
      ) ??
      parsed.structured_scopes ??
      [];

    const warnings: string[] = [];
    const scopeItems: ParsedScopeItem[] = [];
    for (const scope of rawScopes) {
      if (!scope.asset_identifier) {
        warnings.push('Skipped a scope entry with no asset_identifier.');
        continue;
      }
      const type = scope.asset_type
        ? ASSET_TYPE_MAP[scope.asset_type]
        : undefined;
      if (!type) {
        warnings.push(
          `Unmapped HackerOne asset_type "${scope.asset_type ?? 'unknown'}" for "${scope.asset_identifier}" — imported as CLOUD_ASSET.`,
        );
      }
      scopeItems.push({
        type: type ?? 'CLOUD_ASSET',
        pattern: scope.asset_identifier,
        classification:
          scope.eligible_for_submission === false
            ? 'OUT_OF_SCOPE'
            : scope.eligible_for_submission === true
              ? 'IN_SCOPE'
              : 'UNKNOWN',
        notes: scope.instruction,
      });
    }

    return {
      name,
      platform: 'HACKERONE',
      url: attributes.handle
        ? `https://hackerone.com/${attributes.handle}`
        : undefined,
      rulesMarkdown: attributes.policy,
      scopeItems,
 