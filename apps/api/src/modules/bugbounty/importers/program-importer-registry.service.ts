import { Injectable } from '@nestjs/common';
import type { ProgramImportSource } from '@pentesthub/shared';
import type { ProgramImporter } from './program-importer.interface.js';
import { HackerOneImporter } from './adapters/hackerone.importer.js';
import { BugcrowdImporter } from './adapters/bugcrowd.importer.js';
import { IntigritiImporter } from './adapters/intigriti.importer.js';
import { MarkdownImporter } from './adapters/markdown.importer.js';
import { JsonImporter } from './adapters/json.importer.js';

/// Same "constructor injection + Map" registry shape as
/// AiProviderRegistryService (Module 5) / ScannerRunnerRegistry (Module
/// 4) — adding a 6th import source means one new adapter class plus one
/// line here, nothing else in the module changes.
@Injectable()
export class ProgramImporterRegistryService {
  private readonly importers: Map<ProgramImportSource, ProgramImporter>;

  constructor(
    hackerOneImporter: HackerOneImporter,
    bugcrowdImporter: BugcrowdImporter,
    intigritiImporter: IntigritiImporter,
    markdownImporter: MarkdownImporter,
    jsonImporter: JsonImporter,
  ) {
    this.importers = new Map<ProgramImportSource, ProgramImporter>([
      ['HACKERONE', hackerOneImporter],
      ['BUGCROWD', bugcrowdImporter],
      ['INTIGRITI', intigritiImporter],
      ['MARKDOWN', markdownImporter],
      ['JSON', jsonImporter],
    ]);
  }

  get(source: ProgramImportSource): ProgramImporter {
    const importer = this.importers.get(source);
    if (!importer) throw new Error(`Unknown program import source "${source}"`);
    return importer;
  }
}
