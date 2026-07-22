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
    // input.report.workspaceId (not a separate GenerateDraftInput field) —
    // BugReport is always workspace-scoped, so reusing it here avoids
    // threading a redundant workspaceId through every caller.
    const { provider, credential } = await this.providerRegistry.resolveProvider(
      input.report.workspaceId,
      preferred,
    );
    const model = input.model ?? provider.getDefaultModel(credential);

    const systemPrompt = `${this.promptBuilder.buildModePrompt('report')}\n\n${JSON_SHAPE_INSTRUCTION}`;
    const userPrompt = this.buildUserPrompt(input);

    const text = await collectStreamedCompletion(
      provider,
      {
        model,
        maxTokens: this.configService.get('AI_CHAT_STREAM_MAX_TOKENS', {
          infer: true,
        }),
        temperature: 0.3,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      },
      credential,
    );

    return {
      fields: parseDraftResponse(text),
      providerName: provider.name,
      model,
    };
  }

  /// Module 9 — AI "Grammar correction" pass over a single report field.
  /// Kept on this same service (not a new one) since it reuses the exact
  /// same provider-resolution/prompt-builder/collectStreamedCompletion
  /// seam as generateDraft() above, just with a narrower one-field scope
  /// and JSON shape.
  async correctGrammar(input: {
    workspaceId: string;
    fieldName: string;
    text: string;
    provider?: string;
    model?: string;
  }): Promise<{ corrected: string; changes: string[]; providerName: AiProviderName; model: string }> {
    const preferred = isValidProviderName(input.provider) ? input.provider : null;
    const { provider, credential } = await this.providerRegistry.resolveProvider(
      input.workspaceId,
      preferred,
    );
    const model = input.model ?? provider.getDefaultModel(credential);

    const systemPrompt = `You are a technical editor for security vulnerability reports. Correct grammar, spelling, and clarity issues in the given text WITHOUT changing its technical meaning, without adding new claims, and without changing code/payloads/URLs. Respond with ONLY a single JSON object (no markdown fences, no commentary): { "corrected": string, "changes": string[] } — "changes" is a short list of what was fixed (e.g. "Fixed subject-verb agreement in sentence 2"), [] if nothing needed changing.`;
    const userPrompt = `Field: ${input.fieldName}\nText:\n${input.text}`;

    const text = await collectStreamedCompletion(
      provider,
      {
        model,
        maxTokens: this.configService.get('AI_CHAT_STREAM_MAX_TOKENS', { infer: true }),
        temperature: 0.1,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      },
      credential,
    );

    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = (fenced?.[1] ?? text).trim();
    try {
      const parsed = JSON.parse(candidate) as { corrected?: unknown; changes?: unknown };
      return {
        corrected: typeof parsed.corrected === 'string' ? parsed.corrected : input.text,
        changes: Array.isArray(parsed.changes)
          ? parsed.changes.filter((c): c is string => typeof c === 'string')
          : [],
        providerName: provider.name,
        model,
      };
    } catch {
      return { corrected: input.text, changes: [], providerName: provider.name, model };
    }
  }

  /// Module 9 — AI "technical review" pass: flags CVSS/CWE inconsistency,
  /// missing/vague repro steps, weak impact language, etc. across the
  /// whole report. Returns the exact shape stored on
  /// `BugReport.technicalReview` (ReportTechnicalReviewDto).
  async reviewQuality(input: {
    report: BugReport;
    program: BugBountyProgram;
    finding: BugBountyFinding | null;
    provider?: string;
    model?: string;
  }): Promise<{
    issues: { field: string; severity: 'INFO' | 'WARNING' | 'ERROR'; message: string }[];
    providerName: AiProviderName;
    model: string;
  }> {
    const preferred = isValidProviderName(input.provider) ? input.provider : null;
    const { provider, credential } = await this.providerRegistry.resolveProvider(
      input.report.workspaceId,
      preferred,
    );
    const model = input.model ?? provider.getDefaultModel(credential);

    const systemPrompt = `You are a senior bug bounty triager reviewing a vulnerability report draft for quality issues before submission. Check for: CVSS score/vector inconsistency with described severity, vague or non-reproducible steps, weak/unsubstantiated impact claims, missing proof of concept, missing CWE classification. Respond with ONLY a single JSON object: { "issues": [{ "field": string, "severity": "INFO"|"WARNING"|"ERROR", "message": string }] } — [] if the report looks solid.`;
    const userPrompt = this.buildUserPrompt({
      report: input.report,
      program: input.program,
      finding: input.finding,
    });

    const text = await collectStreamedCompletion(
      provider,
      {
        model,
        maxTokens: this.configService.get('AI_CHAT_STREAM_MAX_TOKENS', { infer: true }),
        temperature: 0.2,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      },
      credential,
    );

    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = (fenced?.[1] ?? text).trim();
    try {
      const parsed = JSON.parse(candidate) as {
        issues?: { field?: unknown; severity?: unknown; message?: unknown }[];
      };
      const issues = Array.isArray(parsed.issues)
        ? parsed.issues
            .filter(
              (i): i is { field: string; severity: 'INFO' | 'WARNING' | 'ERROR'; message: string } =>
                typeof i.field === 'string' &&
                typeof i.message === 'string' &&
                (i.severity === 'INFO' || i.severity === 'WARNING' || i.severity === 'ERROR'),
            )
        : [];
      return { issues, providerName: provider.name, model };
    } catch {
      return { issues: [], providerName: provider.name, model };
    }
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
      lines.push(
        `Existing steps to reproduce (refine/expand this): ${report.stepsToReproduce}`,
      );
    lines.push('Draft the report fields for this finding now.');
    return lines.join('\n');
  }
}
