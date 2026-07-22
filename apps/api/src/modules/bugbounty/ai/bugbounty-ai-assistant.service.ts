import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AiProviderName,
  CvssVectorComponents,
  PayloadCategory,
  VulnFindingSeverity,
} from '@pentesthub/shared';
import { AI_PROVIDER_NAMES } from '@pentesthub/shared';
import type { EnvConfig } from '../../../config/env.validation.js';
import { AiProviderRegistryService } from '../../ai/providers/ai-provider-registry.service.js';
import { collectStreamedCompletion } from '../../ai/providers/collect-stream.util.js';
import type { BugBountyFinding, BugBountyProgram } from '../../../prisma-types.js';
import { calculateCvss } from '../cvss/cvss-calculator.util.js';

function isValidProviderName(value: string | undefined): value is AiProviderName {
  return !!value && (AI_PROVIDER_NAMES as string[]).includes(value);
}

function extractJson<T>(raw: string): T | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? raw).trim();
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
}

/// Module 9's AI Bug Bounty Assistant — one service backing the ~11 new
/// AI endpoints (ReviewFinding/SuggestPayloads/GeneratePoc/
/// GenerateReproSteps/GenerateImpact/GenerateRemediation/
/// CalculateSeverity/SuggestAttackPaths/SummarizeEngagement, plus
/// CorrectGrammar/ReviewReportQuality which live in
/// reports/report-draft-assistant.service.ts since they're report-
/// scoped). Every method reuses the exact same AiProviderRegistryService
/// / collectStreamedCompletion seam as Module 5 and
/// ReportDraftAssistantService — no new AI plumbing, just per-capability
/// prompts and defensive JSON parsing (a model that ignores the "JSON
/// only" instruction degrades to an empty/fallback result rather than
/// throwing).
///
/// None of these methods write to the database — every one returns a
/// suggestion for the caller to review and apply via the normal
/// finding/report update endpoints (same "AI proposes, human disposes"
/// stance ADR 0006 established for Report Draft Assistant... except
/// GenerateBugReportDraftHandler *does* auto-apply; the difference here
/// is deliberate: overwriting a live finding's fields without an
/// explicit follow-up action is a bigger blast radius than filling in an
/// unsubmitted report draft).
@Injectable()
export class BugBountyAiAssistantService {
  constructor(
    private readonly providerRegistry: AiProviderRegistryService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  private async complete(
    workspaceId: string,
    systemPrompt: string,
    userPrompt: string,
    opts: { provider?: string; model?: string; temperature?: number },
  ): Promise<{ text: string; providerName: AiProviderName; model: string }> {
    const preferred = isValidProviderName(opts.provider) ? opts.provider : null;
    const { provider, credential } = await this.providerRegistry.resolveProvider(
      workspaceId,
      preferred,
    );
    const model = opts.model ?? provider.getDefaultModel(credential);
    const text = await collectStreamedCompletion(
      provider,
      {
        model,
        maxTokens: this.configService.get('AI_CHAT_STREAM_MAX_TOKENS', { infer: true }),
        temperature: opts.temperature ?? 0.3,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      },
      credential,
    );
    return { text, providerName: provider.name, model };
  }

  private findingContext(finding: BugBountyFinding): string {
    const lines = [
      `Title: ${finding.title}`,
      `Severity: ${finding.severity}`,
      `Description: ${finding.description}`,
    ];
    if (finding.vulnType) lines.push(`Vulnerability type: ${finding.vulnType}`);
    if (finding.endpoint) lines.push(`Endpoint: ${finding.endpoint}`);
    if (finding.payload) lines.push(`Payload: ${finding.payload}`);
    if (finding.cwe) lines.push(`CWE: ${finding.cwe}`);
    if (finding.cvssScore != null) lines.push(`CVSS: ${finding.cvssScore} ${finding.cvssVector ?? ''}`.trim());
    return lines.join('\n');
  }

  async reviewFinding(input: {
    finding: BugBountyFinding;
    provider?: string;
    model?: string;
  }): Promise<{
    suggestions: { field: string; suggestion: string }[];
    suggestedSeverity: VulnFindingSeverity | null;
    suggestedCvss: ReturnType<typeof calculateCvss> | null;
    missingFields: string[];
    providerName: AiProviderName;
    model: string;
  }> {
    const missingFields: string[] = [];
    if (!input.finding.cwe) missingFields.push('cwe');
    if (!input.finding.cvssScore) missingFields.push('cvssScore');
    if (!input.finding.payload) missingFields.push('payload');
    if (!input.finding.endpoint) missingFields.push('endpoint');

    const systemPrompt = `You are a senior bug bounty triager reviewing a finding for completeness and consistency before it's reported. Respond with ONLY a single JSON object: { "suggestions": [{ "field": string, "suggestion": string }], "suggestedSeverity": "INFO"|"LOW"|"MEDIUM"|"HIGH"|"CRITICAL"|null, "suggestedCvss": { "AV": "N"|"A"|"L"|"P", "AC": "L"|"H", "PR": "N"|"L"|"H", "UI": "N"|"R", "S": "U"|"C", "C": "N"|"L"|"H", "I": "N"|"L"|"H", "A": "N"|"L"|"H" } | null }. Only set suggestedSeverity/suggestedCvss if you believe the current values are missing or wrong; null otherwise.`;
    const { text, providerName, model } = await this.complete(
      input.finding.workspaceId,
      systemPrompt,
      this.findingContext(input.finding),
      { provider: input.provider, model: input.model, temperature: 0.2 },
    );

    const parsed = extractJson<{
      suggestions?: { field?: unknown; suggestion?: unknown }[];
      suggestedSeverity?: VulnFindingSeverity | null;
      suggestedCvss?: CvssVectorComponents | null;
    }>(text);

    const suggestions = Array.isArray(parsed?.suggestions)
      ? parsed!.suggestions
          .filter(
            (s): s is { field: string; suggestion: string } =>
              typeof s.field === 'string' && typeof s.suggestion === 'string',
          )
      : [];

    return {
      suggestions,
      suggestedSeverity: parsed?.suggestedSeverity ?? null,
      suggestedCvss: parsed?.suggestedCvss ? calculateCvss(parsed.suggestedCvss) : null,
      missingFields,
      providerName,
      model,
    };
  }

  async suggestPayloads(input: {
    workspaceId: string;
    vulnType?: string;
    context?: string;
    provider?: string;
    model?: string;
  }): Promise<{
    payloads: { category: PayloadCategory; example: string; explanation: string }[];
    providerName: AiProviderName;
    model: string;
  }> {
    const systemPrompt = `You are a penetration testing assistant suggesting test payloads for a specific vulnerability class. Respond with ONLY a single JSON object: { "payloads": [{ "category": string, "example": string, "explanation": string }] } — 3 to 6 payloads, each with a short one-sentence explanation of what it tests and why. Categories should be short uppercase-with-underscores tokens (e.g. XSS, SQLI, SSRF, IDOR, RCE, SSTI, XXE, PATH_TRAVERSAL, AUTH_BYPASS, DESERIALIZATION, OTHER).`;
    const userPrompt = [
      input.vulnType ? `Vulnerability type: ${input.vulnType}` : null,
      input.context ? `Context: ${input.context}` : null,
    ]
      .filter((l): l is string => !!l)
      .join('\n') || 'General web application testing payloads.';

    const { text, providerName, model } = await this.complete(
      input.workspaceId,
      systemPrompt,
      userPrompt,
      { provider: input.provider, model: input.model, temperature: 0.4 },
    );
    const parsed = extractJson<{
      payloads?: { category?: unknown; example?: unknown; explanation?: unknown }[];
    }>(text);
    const payloads = Array.isArray(parsed?.payloads)
      ? parsed!.payloads.filter(
          (p): p is { category: PayloadCategory; example: string; explanation: string } =>
            typeof p.category === 'string' &&
            typeof p.example === 'string' &&
            typeof p.explanation === 'string',
        )
      : [];
    return { payloads, providerName, model };
  }

  async generatePoc(input: {
    finding: BugBountyFinding;
    provider?: string;
    model?: string;
  }): Promise<{
    proofOfConcept: string;
    requestExample: string | null;
    responseExample: string | null;
    providerName: AiProviderName;
    model: string;
  }> {
    const systemPrompt = `You are writing a proof-of-concept walkthrough for a confirmed vulnerability finding, for inclusion in a bug bounty report. Respond with ONLY a single JSON object: { "proofOfConcept": string, "requestExample": string|null, "responseExample": string|null }. "proofOfConcept" is a clear numbered walkthrough. requestExample/responseExample are raw HTTP request/response text if applicable to this vulnerability type, null otherwise.`;
    const { text, providerName, model } = await this.complete(
      input.finding.workspaceId,
      systemPrompt,
      this.findingContext(input.finding),
      { provider: input.provider, model: input.model, temperature: 0.3 },
    );
    const parsed = extractJson<{
      proofOfConcept?: unknown;
      requestExample?: unknown;
      responseExample?: unknown;
    }>(text);
    return {
      proofOfConcept: typeof parsed?.proofOfConcept === 'string' ? parsed.proofOfConcept : text.trim(),
      requestExample: typeof parsed?.requestExample === 'string' ? parsed.requestExample : null,
      responseExample: typeof parsed?.responseExample === 'string' ? parsed.responseExample : null,
      providerName,
      model,
    };
  }

  async generateReproSteps(input: {
    finding: BugBountyFinding;
    provider?: string;
    model?: string;
  }): Promise<{ stepsToReproduce: string; providerName: AiProviderName; model: string }> {
    const systemPrompt = `Write clear, numbered steps to reproduce this vulnerability finding, precise enough for someone unfamiliar with the target to follow. Respond with ONLY the steps as plain text (numbered list), no JSON, no commentary.`;
    const { text, providerName, model } = await this.complete(
      input.finding.workspaceId,
      systemPrompt,
      this.findingContext(input.finding),
      { provider: input.provider, model: input.model, temperature: 0.3 },
    );
    return { stepsToReproduce: text.trim(), providerName, model };
  }

  async generateImpact(input: {
    finding: BugBountyFinding;
    provider?: string;
    model?: string;
  }): Promise<{ impact: string; providerName: AiProviderName; model: string }> {
    const systemPrompt = `Write a realistic, non-exaggerated impact statement for this vulnerability finding — what a real attacker could actually achieve, worst realistic case. Respond with ONLY the impact statement as plain text (2-4 sentences), no JSON, no commentary.`;
    const { text, providerName, model } = await this.complete(
      input.finding.workspaceId,
      systemPrompt,
      this.findingContext(input.finding),
      { provider: input.provider, model: input.model, temperature: 0.3 },
    );
    return { impact: text.trim(), providerName, model };
  }

  async generateRemediation(input: {
    finding: BugBountyFinding;
    provider?: string;
    model?: string;
  }): Promise<{ mitigation: string; providerName: AiProviderName; model: string }> {
    const systemPrompt = `Write concrete, actionable remediation guidance for this vulnerability finding — specific fixes, not generic advice. Respond with ONLY the remediation text as plain text, no JSON, no commentary.`;
    const { text, providerName, model } = await this.complete(
      input.finding.workspaceId,
      systemPrompt,
      this.findingContext(input.finding),
      { provider: input.provider, model: input.model, temperature: 0.3 },
    );
    return { mitigation: text.trim(), providerName, model };
  }

  async calculateSeverity(input: {
    finding: BugBountyFinding;
    provider?: string;
    model?: string;
  }): Promise<{
    severity: VulnFindingSeverity;
    cvss: ReturnType<typeof calculateCvss>;
    reasoning: string;
    providerName: AiProviderName;
    model: string;
  }> {
    const systemPrompt = `You are scoring a vulnerability finding's CVSS 3.1 base metrics. Respond with ONLY a single JSON object: { "components": { "AV": "N"|"A"|"L"|"P", "AC": "L"|"H", "PR": "N"|"L"|"H", "UI": "N"|"R", "S": "U"|"C", "C": "N"|"L"|"H", "I": "N"|"L"|"H", "A": "N"|"L"|"H" }, "reasoning": string }. "reasoning" is a short 1-2 sentence justification for the chosen metrics.`;
    const { text, providerName, model } = await this.complete(
      input.finding.workspaceId,
      systemPrompt,
      this.findingContext(input.finding),
      { provider: input.provider, model: input.model, temperature: 0.1 },
    );
    const parsed = extractJson<{ components?: CvssVectorComponents; reasoning?: unknown }>(text);
    // Deterministic fallback (no scored metrics parsed) — treat as
    // moderate/unknown rather than fabricating a score; the caller sees
    // reasoning explaining the model didn't return a usable answer.
    const fallbackComponents: CvssVectorComponents = {
      AV: 'N',
      AC: 'L',
      PR: 'N',
      UI: 'N',
      S: 'U',
      C: 'L',
      I: 'L',
      A: 'N',
    };
    const cvss = calculateCvss(parsed?.components ?? fallbackComponents);
    return {
      severity: cvss.severity,
      cvss,
      reasoning:
        typeof parsed?.reasoning === 'string'
          ? parsed.reasoning
          : 'Model did not return parseable CVSS metrics; falling back to a conservative estimate.',
      providerName,
      model,
    };
  }

  async suggestAttackPaths(input: {
    workspaceId: string;
    finding: BugBountyFinding | null;
    targetValue: string | null;
    provider?: string;
    model?: string;
  }): Promise<{
    suggestions: { title: string; rationale: string; suggestedPayloadCategory: PayloadCategory | null }[];
    providerName: AiProviderName;
    model: string;
  }> {
    const systemPrompt = `You are a bug bounty hunter brainstorming additional attack angles beyond what's already been tried. Respond with ONLY a single JSON object: { "suggestions": [{ "title": string, "rationale": string, "suggestedPayloadCategory": string|null }] } — 3 to 5 suggestions, each with a one-sentence rationale.`;
    const userPrompt = [
      input.targetValue ? `Target: ${input.targetValue}` : null,
      input.finding ? `Known finding:\n${this.findingContext(input.finding)}` : null,
    ]
      .filter((l): l is string => !!l)
      .join('\n\n') || 'No specific target or finding provided — suggest general reconnaissance-driven attack paths.';

    const { text, providerName, model } = await this.complete(
      input.workspaceId,
      systemPrompt,
      userPrompt,
      { provider: input.provider, model: input.model, temperature: 0.5 },
    );
    const parsed = extractJson<{
      suggestions?: { title?: unknown; rationale?: unknown; suggestedPayloadCategory?: unknown }[];
    }>(text);
    const suggestions = Array.isArray(parsed?.suggestions)
      ? parsed!.suggestions
          .filter((s): s is { title: string; rationale: string; suggestedPayloadCategory: PayloadCategory | null } =>
            typeof s.title === 'string' && typeof s.rationale === 'string',
          )
          .map((s) => ({
            title: s.title,
            rationale: s.rationale,
            suggestedPayloadCategory:
              typeof s.suggestedPayloadCategory === 'string'
                ? (s.suggestedPayloadCategory as PayloadCategory)
                : null,
          }))
      : [];
    return { suggestions, providerName, model };
  }

  async summarizeEngagement(input: {
    workspaceId: string;
    program: BugBountyProgram | null;
    findings: BugBountyFinding[];
    provider?: string;
    model?: string;
  }): Promise<{
    summary: string;
    coverageNotes: string;
    recommendedNextSteps: string[];
    providerName: AiProviderName;
    model: string;
  }> {
    const systemPrompt = `Summarize this bug bounty engagement for a stakeholder who hasn't been following it day to day. Respond with ONLY a single JSON object: { "summary": string, "coverageNotes": string, "recommendedNextSteps": string[] }. "summary" is 3-5 sentences. "coverageNotes" describes what's been tested vs. likely gaps. "recommendedNextSteps" is 2-5 short actionable items.`;
    const findingLines = input.findings
      .slice(0, 30)
      .map((f) => `- [${f.severity}] ${f.title} (${f.stage})`)
      .join('\n');
    const userPrompt = [
      input.program ? `Program: ${input.program.name} (${input.program.platform})` : 'Program: (workspace-wide)',
      `Findings (${input.findings.length} total, showing up to 30):`,
      findingLines || '(none yet)',
    ].join('\n');

    const { text, providerName, model } = await this.complete(
      input.workspaceId,
      systemPrompt,
      userPrompt,
      { provider: input.provider, model: input.model, temperature: 0.3 },
    );
    const parsed = extractJson<{
      summary?: unknown;
      coverageNotes?: unknown;
      recommendedNextSteps?: unknown[];
    }>(text);
    return {
      summary: typeof parsed?.summary === 'string' ? parsed.summary : text.trim(),
      coverageNotes: typeof parsed?.coverageNotes === 'string' ? parsed.coverageNotes : '',
      recommendedNextSteps: Array.isArray(parsed?.recommendedNextSteps)
        ? parsed!.recommendedNextSteps.filter((s): s is string => typeof s === 'string')
        : [],
      providerName,
      model,
    };
  }
}
