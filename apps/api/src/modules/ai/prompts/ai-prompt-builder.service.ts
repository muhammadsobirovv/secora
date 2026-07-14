import { Injectable } from '@nestjs/common';
import { AI_TOOL_NAMES } from '@pentesthub/shared';
import type { AiContextBundle } from '../context/ai-context.types.js';
import type { AiChatMessage } from '../providers/ai-provider.interface.js';
import {
  AI_COPILOT_IDENTITY_PROMPT,
  renderContextPrompt,
} from './system.prompts.js';
import {
  AI_SECURITY_GUARDRAILS_PROMPT,
  renderAvailableToolsPrompt,
} from './security.prompts.js';
import { RECON_ANALYSIS_PROMPT } from './recon.prompts.js';
import { FINDING_ANALYSIS_PROMPT } from './finding-analysis.prompts.js';
import { REPORT_DRAFTING_PROMPT } from './report.prompts.js';
import { CODING_ASSISTANCE_PROMPT } from './coding.prompts.js';

const RECON_KEYWORDS = [
  'recon',
  'subdomain',
  'dns',
  'asn',
  'whois',
  'port',
  'nmap',
  'attack surface',
];
const FINDING_KEYWORDS = [
  'cve',
  'cwe',
  'owasp',
  'finding',
  'vulnerab',
  'severity',
  'jwt',
  'csp',
  'header',
  'exploit this',
];
const REPORT_KEYWORDS = [
  'report',
  'executive summary',
  'write up',
  'bug bounty',
  'summary of',
];
const CODING_KEYWORDS = [
  'poc',
  'proof of concept',
  'payload',
  'script',
  'code',
  'curl',
  'exploit',
];

/// Composes the final system-prompt message array for a turn. This is the
/// one place prompt fragments (Prompt Architecture) get assembled — every
/// fragment stays independently editable/testable, and mode-selection
/// logic (simple keyword heuristics for Phase 1; see ADR 0005 for why a
/// classifier model call was deliberately not used here) lives in exactly
/// one place instead of being duplicated per caller.
@Injectable()
export class AiPromptBuilderService {
  buildSystemMessages(
    context: AiContextBundle,
    latestUserMessage: string,
  ): AiChatMessage[] {
    const modePrompts = this.selectModePrompts(latestUserMessage);
    const sections = [
      AI_COPILOT_IDENTITY_PROMPT,
      AI_SECURITY_GUARDRAILS_PROMPT,
      renderAvailableToolsPrompt(AI_TOOL_NAMES),
      ...modePrompts,
      renderContextPrompt(context),
    ];
    return [{ role: 'system', content: sections.join('\n\n') }];
  }

  /// Exposed separately so tools (draft_report, generate_poc,
  /// generate_payloads) can force a specific mode instead of relying on
  /// keyword-matching the tool's own input.
  buildModePrompt(mode: 'recon' | 'finding' | 'report' | 'coding'): string {
    switch (mode) {
      case 'recon':
        return RECON_ANALYSIS_PROMPT;
      case 'finding':
        return FINDING_ANALYSIS_PROMPT;
      case 'report':
        return REPORT_DRAFTING_PROMPT;
      case 'coding':
        return CODING_ASSISTANCE_PROMPT;
    }
  }

  private selectModePrompts(message: string): string[] {
    const lower = message.toLowerCase();
    const prompts: string[] = [];
    if (RECON_KEYWORDS.some((k) => lower.includes(k)))
      prompts.push(RECON_ANALYSIS_PROMPT);
    if (FINDING_KEYWORDS.some((k) => lower.includes(k)))
      prompts.push(FINDING_ANALYSIS_PROMPT);
    if (REPORT_KEYWORDS.some((k) => lower.includes(k)))
      prompts.push(REPORT_DRAFTING_PROMPT);
    if (CODING_KEYWORDS.some((k) => lower.includes(k)))
      prompts.push(CODING_ASSISTANCE_PROMPT);
    return prompts;
  }
}
