import { describe, expect, it } from '@jest/globals';
import type { AiToolName } from '@pentesthub/shared';
import { AI_TOOL_NAMES } from '@pentesthub/shared';
import type { AiTool } from './ai-tool.interface.js';
import { AiToolRegistryService } from './ai-tool-registry.service.js';
import type { SearchFindingsTool } from './search-findings.tool.js';
import type { SearchReconDataTool } from './search-recon-data.tool.js';
import type { SearchEvidenceTool } from './search-evidence.tool.js';
import type { SearchNotesTool } from './search-notes.tool.js';
import type { SearchProjectsTool } from './search-projects.tool.js';
import type { SearchTargetsTool } from './search-targets.tool.js';
import type { SearchTemplatesTool } from './search-templates.tool.js';
import type { CreateNoteTool } from './create-note.tool.js';
import type { DraftReportTool } from './draft-report.tool.js';
import type { GeneratePocTool } from './generate-poc.tool.js';
import type { GeneratePayloadsTool } from './generate-payloads.tool.js';

function fakeTool(name: AiToolName): AiTool {
  return {
    name,
    description: `fake ${name}`,
    execute: () => Promise.resolve({ ok: true, tool: name }),
  };
}

function buildRegistry(): AiToolRegistryService {
  return new AiToolRegistryService(
    fakeTool('search_findings') as unknown as SearchFindingsTool,
    fakeTool('search_recon_data') as unknown as SearchReconDataTool,
    fakeTool('search_evidence') as unknown as SearchEvidenceTool,
    fakeTool('search_notes') as unknown as SearchNotesTool,
    fakeTool('search_projects') as unknown as SearchProjectsTool,
    fakeTool('search_targets') as unknown as SearchTargetsTool,
    fakeTool('search_templates') as unknown as SearchTemplatesTool,
    fakeTool('create_note') as unknown as CreateNoteTool,
    fakeTool('draft_report') as unknown as DraftReportTool,
    fakeTool('generate_poc') as unknown as GeneratePocTool,
    fakeTool('generate_payloads') as unknown as GeneratePayloadsTool,
  );
}

describe('AiToolRegistryService', () => {
  it('registers every tool name declared in AI_TOOL_NAMES', () => {
    const registry = buildRegistry();
    const list = registry.list();
    expect(list).toHaveLength(AI_TOOL_NAMES.length);
    for (const name of AI_TOOL_NAMES) {
      expect(registry.get(name)?.name).toBe(name);
    }
  });

  it('get() returns undefined for an unknown tool name', () => {
    const registry = buildRegistry();
    expect(registry.get('not_a_real_tool')).toBeUndefined();
  });

  it('list() returns the tools in their registered order', () => {
    const registry = buildRegistry();
    expect(registry.list().map((t) => t.name)).toEqual(AI_TOOL_NAMES);
  });

  it('a resolved tool executes and returns its result', async () => {
    const registry = buildRegistry();
    const tool = registry.get('create_note');
    const result = await tool?.execute(
      {},
      { workspaceId: 'w1', projectId: 'p1', userId: 'u1' },
    );
    expect(result).toEqual({ ok: true, tool: 'create_note' });
  });
});
