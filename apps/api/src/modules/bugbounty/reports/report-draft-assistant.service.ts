import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AiProviderName } from '@pentesthub/shared';
import { AI_PROVIDER_NAMES } from '@pentesthub/shared';
import type { EnvConfig } from '../../../config/env.validation.js';
import { AiProviderRegistryService } from '../../ai/providers/ai-provider-registry.service.js';
import { collectStreamedCompletion } from '../../ai/providers/collect-stream.util.js';
import { AiPromptBuilderService } from '../../ai/prompts/ai-prompt-builder.service.js';
import type {
  BugBountyFinding,
  BugBountyProgram,
  BugReport,
} from '../../../prisma-types.js';

export interface ReportDraftFields {
  executiveSummary: string;
  technicalDetails: string;
  impact: string;
  risk: string;
  remediation: string;
  references: string[];
}

export interface GenerateDraftInput {
  report: BugReport;
  program: BugBountyProgram;
  finding: BugBountyFinding | null;
  provider?: string;
  model?: string;
}

const JSON_SHAPE_INSTRUCTION = `Respond with ONLY a single JSON object (no markdown code fences, no commentary before or after) matching exactly this shape:
{
  "executiveSummary": string,   // 2-4 sentences, plain language, no CVE/CWE jargon
  "technicalDetails": string,   // numbered steps to reproduce, copy-pasteable where possible
  "impact": string,             // realistic worst case for this target
  "risk": string,               // one short risk-rating sentence, e.g. "High — publicly reachable, no authentication required"
  "remediation": string,        // concrete fix guidance
  "references": string[]        // CWE/OWASP/CVE links or ids relevant to this finding, [] if none apply
}`;

const FALLBACK_FIELDS: Omit<ReportDraftFields, 'technicalDetails'> = {
  executiveSummary: '',
  impact: '',
  risk: '',
  remediation: '',
  references: [],
};

function isValidProviderName(
  value: string | undefined,
): value is AiProviderName {
  return !!value && (AI_PROVIDER_NAMES as string[]).includes(value);
}

/// Parses the model's JSON response defensively — a model that ignores the
/// "JSON only" instruction (wraps it in a ```json fence, adds a preamble
/// sentence, etc.) shouldn't crash the command. Falls back to putting the
/// raw text in technicalDetails, mirroring classifyScopeValue's "fall back
/// rather than guess" convention elsewhere in this module.
export function parseDraftResponse(raw: string): ReportDraftFields {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? raw).trim();
  try {
    const parsed = JSON.parse(candidate) as Partial<ReportDraftFields>;
    return {
      executiveSummary:
        typeof parsed.executiveSummary === 'string'
          ? parsed.executiveSummary
          : '',
      technicalDetails:
        typeof parsed.technicalDetails === 'string'
          ? parsed.technicalDetails
          : '',
      impact: typeof parsed.impact === 'string' ? parsed.impact : '',
      risk: typeof parsed.risk === 'string' ? parsed.risk : '',
      remediation:
        typeof parsed.remediation === 'string' ? parsed.remediation : '',
      references: Array.isArray(parsed.references)
        ? parsed.references.filter((r): r is string => typeof r === 'string')
        : [],
    };
  } catch {
    return { ...FALLBACK_FIELDS, technicalDetails: raw.trim() };
  }
}

@Injectable()
export class ReportDraftAssistantService {
  constructor(
    private readonly providerRegistry: AiProviderRegistryService,
    private readonly promptBuilder: AiPromptBuilderService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  async generateDraft(input: GenerateDraftInput): Promise<{
    fields: ReportDraftFields;
    providerName: AiProviderName;
    model: string;
  }> {
    const preferred = isValidProviderName(input.provider)
      ? input.provider
      : null;
    const provider = this.providerRegistry.resolveProvider(preferred);
    const model = input.model ?? provider.getDefaultModel();

    const systemPrompt = `${this.promptBuilder.buildModePrompt('report')}\n\n${JSON_SHAPE_INSTRUCTION}`;
    const userPrompt = this.buildUserPrompt(input);

    const text = await collectStreamedCompletion(provider, {
      model,
      maxTokens: this.configService.get('AI_CHAT_STREAM_MAX_TOKENS', {
        infer: true,
      }),
      temperature: 0.3,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    return {
      fields: parseDraftResponse(text),
      providerName: provider.name,
      model,
    };
  }

  private buildUserPrompt(input: GenerateDraftInput): string {
    const { report, program, finding } = input;
    const lines: string[] = [
      `Program: ${program.name} (${program.platform})`,
      `Report title: ${report.title}`,
    ];
    if (finding) {
      lines.push(`Finding severity: ${finding.severity}`);
      if (finding.endpoint)
        lines.push(`Affected endpoint: ${finding.endpoint}`);
      if (finding.vulnType)
        lines.push(`Vulnerability type: ${finding.vulnType}`);
      if (finding.cwe) lines.push(`CWE: ${finding.cwe}`);
      if (finding.cvssScore != null)
        lines.push(
          `CVSS: ${finding.cvssScore} ${finding.cvssVector ?? ''}`.trim(),
        );
      lines.push(`Finding description: ${finding.description}`);
      if (finding.payload) lines.push(`Payload used: ${finding.payload}`);
    } else if (report.summary) {
      lines.push(`Existing summary (refine/expand this): ${report.summary}`);
    }
    if (report.stepsToReproduce)
      lines.pus