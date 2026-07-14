import { Injectable } from '@nestjs/common';
import type { AiToolName } from '@pentesthub/shared';
import type { AiTool } from './ai-tool.interface.js';
import { SearchFindingsTool } from './search-findings.tool.js';
import { SearchReconDataTool } from './search-recon-data.tool.js';
import { SearchEvidenceTool } from './search-evidence.tool.js';
import { SearchNotesTool } from './search-notes.tool.js';
import { SearchProjectsTool } from './search-projects.tool.js';
import { SearchTargetsTool } from './search-targets.tool.js';
import { SearchTemplatesTool } from './search-templates.tool.js';
import { CreateNoteTool } from './create-note.tool.js';
import { DraftReportTool } from './draft-report.tool.js';
import { GeneratePocTool } from './generate-poc.tool.js';
import { GeneratePayloadsTool } from './generate-payloads.tool.js';

/// Resolves a tool name (as emitted by the model inside a
/// `<tool_call name="...">` tag) to its implementation. Same "explicit
/// constructor list + Map" pattern as ScannerRunnerRegistry — adding a
/// tool means one new class + one line here, nothing in AiChatService or
/// the tool-calling loop changes (AI Tool Calling: "future modules must
/// be able to register tools without modifying the AI Chat").
@Injectable()
export class AiToolRegistryService {
  private readonly tools: Map<AiToolName, AiTool>;

  constructor(
    searchFindings: SearchFindingsTool,
    searchReconData: SearchReconDataTool,
    searchEvidence: SearchEvidenceTool,
    searchNotes: SearchNotesTool,
    searchProjects: SearchProjectsTool,
    searchTargets: SearchTargetsTool,
    searchTemplates: SearchTemplatesTool,
    createNote: CreateNoteTool,
    draftReport: DraftReportTool,
    generatePoc: GeneratePocTool,
    generatePayloads: GeneratePayloadsTool,
  ) {
    const all: AiTool[] = [
      searchFindings,
      searchReconData,
      searchEvidence,
      searchNotes,
      searchProjects,
      searchTargets,
      searchTemplates,
      createNote,
      draftReport,
      generatePoc,
      generatePayloads,
    ];
    this.tools = new Map(all.map((tool) => [tool.name, tool]));
  }

  get(name: string): AiTool | undefined {
    return this.tools.get(name as AiToolName);
  }

  list(): AiTool[] {
    return [...this.tools.values()];
  }
}
