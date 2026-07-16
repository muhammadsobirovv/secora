import { Injectable } from '@nestjs/common';
import type { ScopeClassification, ScopeItemType } from '@pentesthub/shared';
import type {
  ParsedProgramImport,
  ParsedScopeItem,
  ProgramImporter,
} from '../program-importer.interface.js';
import { ProgramImportParseError } from '../program-importer.interface.js';

const CIDR_RE = /^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/;
const IP_RANGE_RE = /^\d{1,3}(\.\d{1,3}){3}\s*-\s*\d{1,3}(\.\d{1,3}){3}$/;
const IN_SCOPE_HEADING_RE = /in.?scope/i;
const OUT_OF_SCOPE_HEADING_RE = /out.?of.?scope|excluded/i;
const RULES_HEADING_RE = /rules|program\s*rules|terms/i;
const DISCLOSURE_HEADING_RE = /disclosure/i;

/// Best-effort type guess for a bare scope line with no explicit type
/// annotation — same heuristics a human skimming a program's public scope
/// page would use. Reused nowhere else: JSON/platform importers always
/// carry an explicit asset type, only free-form Markdown doesn't.
function guessScopeItemType(pattern: string): ScopeItemType {
  if (pattern.startsWith('*.')) return 'WILDCARD';
  if (CIDR_RE.test(pattern)) return 'CIDR';
  if (IP_RANGE_RE.test(pattern)) return 'IP_RANGE';
  if (/^https?:\/\//i.test(pattern)) return 'URL';
  if (/^(com|org|net|io)\.[a-z0-9.]+$/i.test(pattern)) return 'MOBILE_APP';
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(pattern)) return 'DOMAIN';
  return 'CLOUD_ASSET';
}

/// Extracts a bullet-list line's pattern + optional trailing description
/// — supports "- pattern", "- pattern - description", and
/// "- pattern (description)".
function parseBulletLine(
  line: string,
): { pattern: string; notes?: string } | null {
  const bullet = line.match(/^\s*[-*]\s+(.*)$/);
  if (!bullet) return null;
  const content = bullet[1]?.trim();
  if (!content) return null;

  const parenMatch = content.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (parenMatch?.[1] && parenMatch[2]) {
    return { pattern: parenMatch[1].trim(), notes: parenMatch[2].trim() };
  }
  const dashMatch = content.match(/^(\S+)\s+-\s+(.+)$/);
  if (dashMatch?.[1] && dashMatch[2]) {
    return { pattern: dashMatch[1].trim(), notes: dashMatch[2].trim() };
  }
  return { pattern: content };
}

@Injectable()
export class MarkdownImporter implements ProgramImporter {
  readonly source = 'MARKDOWN' as const;

  parse(raw: string): ParsedProgramImport {
    const lines = raw.split(/\r?\n/);
    let name: string | undefined;
    let section: ScopeClassification | 'RULES' | 'DISCLOSURE' | 'OTHER' =
      'OTHER';
    const scopeItems: ParsedScopeItem[] = [];
    const rulesLines: string[] = [];
    const disclosureLines: string[] = [];
    const warnings: string[] = [];

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      const heading = line.match(/^#{1,3}\s+(.*)$/);
      if (heading?.[1]) {
        const text = heading[1].trim();
        if (!name && line.startsWith('# ')) {
          name = text;
          continue;
        }
        if (IN_SCOPE_HEADING_RE.test(text)) section = 'IN_SCOPE';
        else if (OUT_OF_SCOPE_HEADING_RE.test(text)) section = 'OUT_OF_SCOPE';
        else if (RULES_HEADING_RE.test(text)) section = 'RULES';
        else if (DISCLOSURE_HEADING_RE.test(text)) section = 'DISCLOSURE';
        else section = 'OTHER';
        continue;
      }

      if (section === 'IN_SCOPE' || section === 'OUT_OF_SCOPE') {
        const bullet = parseBulletLine(line);
        if (bullet) {
          scopeItems.push({
            type: guessScopeItemType(bullet.pattern),
            pattern: bullet.pattern,
            classification: section,
            notes: bullet.notes,
          });
        }
      } else if (section === 'RULES' && line.trim()) {
        rulesLines.push(line);
      } else if (section === 'DISCLOSURE' && line.trim()) {
        disclosureLines.push(line);
      }
    }

    if (!name) {
      throw new ProgramImportParseError(
        this.source,
        'no top-level "# Program Name" heading found',
      );
    }
    if (scopeItems.length === 0) {
      warnings.push(
        'No "## In Scope" / "## Out of Scope" section with bullet items was found.',
      );
    }

    return {
      name,
      platform: 'CUSTOM',
      rulesMarkdown: rulesLines.length ? rulesLines.join('\n') : undefined,
      disclosurePolicy: disclosureLines.length
        ? disclosureLines.join('\n')
        : undefined,
      scopeItems,
      warnings,
  