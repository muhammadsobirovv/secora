import {
  ReportAuthorizationDto,
  PROFILE_STAGES,
  type PipelineStage,
  type ReportExplanationTextDto,
  type ReportFindingDto,
  type ReportLanguage,
  type ReportNotTestedDto,
  type ReportStageDto,
  type ReportConfidence,
  type VulnFindingSeverity,
  type VulnReportDto,
  type VulnScanProfile,
} from '@pentesthub/shared';
import { PIPELINE_TOOLS } from '../pipeline/tool-versions.js';
import {
  computeScore,
  dedupeFindings,
  extractCves,
  mergedVerification,
  reportConfidence,
  SEVERITY_RANK,
  type MergedFinding,
  type RawFinding,
} from './finding-quality.js';
import { prepareEvidence } from './redact.util.js';
import { severityLead, staticExplanation } from './static-explanations.js';
import { detectStack, snippetFor } from './stack-snippets.js';

/// Builds the report from what the scan stored. Pure: the service loads rows,
/// this decides what they mean. It never calls a tool and never sends traffic.

export interface ReportJobInput {
  id: string;
  status: string;
  config: Record<string, unknown> | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

export interface ReportInput {
  /// What the scan ran under; verified ownership when absent.
  authorization?: ReportAuthorizationDto;
  job: ReportJobInput;
  target: { id: string; type: string; value: string };
  findings: RawFinding[];
  /// The job's log messages, oldest first.
  logs: string[];
  language: ReportLanguage;
  now: Date;
}

const MARKER = /^\[stage\] (\w+) (start|done|skipped|failed)(?: - (.*))?$/;
const SCOPE = /^Scope: (\S+) (and its subdomains|only)\b/;
const EVIDENCE_CAP = 3000;
const TERMINAL = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);

export function profileOf(
  config: Record<string, unknown> | null,
): VulnScanProfile | null {
  const value = config?.profile;
  return value === 'QUICK' || value === 'STANDARD' || value === 'DEEP'
    ? value
    : null;
}

function stagesFrom(
  profile: VulnScanProfile | null,
  logs: string[],
  terminal: boolean,
): ReportStageDto[] {
  const marks = new Map<string, { state: string; note: string | null }>();
  for (const line of logs) {
    const match = MARKER.exec(line);
    if (match) marks.set(match[1], { state: match[2], note: match[3] ?? null });
  }
  const planned: readonly PipelineStage[] = profile
    ? PROFILE_STAGES[profile]
    : [];
  return planned.map((stage) => {
    const mark = marks.get(stage);
    if (!mark) return { stage, state: 'not-run', note: null };
    if (mark.state === 'done') return { stage, state: 'done', note: mark.note };
    if (mark.state === 'skipped')
      return { stage, state: 'skipped', note: mark.note };
    if (mark.state === 'failed')
      return { stage, state: 'failed', note: mark.note };
    // Started and never finished: the job ended, or is still inside it.
    return terminal
      ? { stage, state: 'failed', note: 'The stage did not finish.' }
      : { stage, state: 'not-run', note: null };
  });
}

function notTestedFor(
  profile: VulnScanProfile | null,
  stages: ReportStageDto[],
  includesSubdomains: boolean | null,
): ReportNotTestedDto[] {
  const out: ReportNotTestedDto[] = [];
  for (const stage of stages) {
    if (stage.state === 'failed')
      out.push({
        code: 'STAGE_FAILED',
        stage: stage.stage,
        detail: stage.note ?? undefined,
      });
    else if (stage.state === 'skipped')
      out.push({
        code: 'STAGE_SKIPPED',
        stage: stage.stage,
        detail: stage.note ?? undefined,
      });
    else if (stage.state === 'not-run')
      out.push({ code: 'STAGE_NOT_RUN', stage: stage.stage });
  }
  if (profile === 'QUICK')
    out.push({ code: 'HOME_PAGE_ONLY' }, { code: 'NO_TEMPLATES' });
  if (profile !== 'DEEP')
    out.push(
      { code: 'NO_PORT_SCAN' },
      { code: 'NO_CONTENT_DISCOVERY' },
      { code: 'NO_XSS_TESTING' },
    );
  if (profile === 'DEEP') out.push({ code: 'NO_STORED_XSS' });
  if (profile === 'STANDARD' || profile === 'DEEP')
    out.push({ code: 'HTTP_TEMPLATES_ONLY' });
  if (includesSubdomains === false)
    out.push({ code: 'SUBDOMAINS_NOT_COVERED' });
  out.push({ code: 'NO_AUTH' }, { code: 'NO_BUSINESS_LOGIC' });
  return out;
}

function hostOf(group: MergedFinding): string {
  return group.host;
}

/// The built-in explanation, in the report's language. The tool's own advice is
/// English, so it is used as "how to fix" only in an English report.
function builtInFor(
  issueKey: string,
  severity: VulnFindingSeverity,
  remediation: string,
  language: ReportLanguage,
): ReportExplanationTextDto {
  const base = staticExplanation(issueKey, language);
  return {
    whatIsThis: base.whatIsThis,
    whyItMatters: `${severityLead(severity, language)} ${base.whyItMatters}`,
    howToFix: language === 'en' && remediation ? remediation : base.howToFix,
  };
}

function cweLink(cwe: string | null): string[] {
  const number = cwe && /^CWE-(\d+)$/i.exec(cwe)?.[1];
  return number
    ? [`https://cwe.mitre.org/data/definitions/${number}.html`]
    : [];
}

function toFindingDto(
  group: MergedFinding,
  stack: ReturnType<typeof detectStack>,
  language: ReportLanguage,
): ReportFindingDto {
  const { primary, members } = group;
  const verification = mergedVerification(members);
  const confidence: ReportConfidence = reportConfidence(
    group.severity,
    verification,
  );

  const pick = (key: 'request' | 'response' | 'payload'): string | null => {
    for (const member of members) {
      const text = prepareEvidence(member.evidence[key], EVIDENCE_CAP);
      if (text) return text;
    }
    return null;
  };

  const remediation =
    members
      .map((m) =>
        typeof m.data.remediation === 'string' ? m.data.remediation.trim() : '',
      )
      .find((text) => text.length > 0) ??
    staticExplanation(group.issueKey, 'en').howToFix;

  const cwe = primary.cwe ?? members.find((m) => m.cwe)?.cwe ?? null;
  const references = [
    ...new Set(
      [...members.flatMap((m) => m.references), ...cweLink(cwe)].filter((ref) =>
        /^https?:\/\//i.test(ref),
      ),
    ),
  ].slice(0, 10);

  return {
    id: primary.id,
    issueKey: group.issueKey,
    title: primary.title,
    severity: group.severity,
    confidence,
    affected: group.affected,
    host: hostOf(group),
    path: group.path,
    description: primary.description,
    builtIn: builtInFor(group.issueKey, group.severity, remediation, language),
    evidence: {
      request: pick('request'),
      response: pick('response'),
      payload: pick('payload'),
    },
    sources: members.map((m) => ({
      tool: m.scanner,
      findingId: m.id,
      title: m.title,
    })),
    remediation,
    snippet: snippetFor(group.issueKey, stack),
    stack,
    cwe,
    cves: extractCves(
      primary.title,
      primary.description,
      ...members.flatMap((m) => [...m.references, ...m.tags]),
    ),
    owasp:
      primary.owaspCategory ??
      members.find((m) => m.owaspCategory)?.owaspCategory ??
      null,
    references,
    verification,
  };
}

export function buildReport(input: ReportInput): VulnReportDto {
  const { job, target, now } = input;
  const profile = profileOf(job.config);
  const terminal = TERMINAL.has(job.status);

  const groups = dedupeFindings(input.findings);
  // One stack for the whole site, from every captured header and cookie.
  const stack = detectStack(
    ...input.findings.flatMap((f) => [f.evidence.response, f.evidence.request]),
    ...input.findings.map((f) => f.description),
  );
  const findings = groups.map((group) =>
    toFindingDto(group, stack, input.language),
  );

  const counts = Object.fromEntries(
    (Object.keys(SEVERITY_RANK) as VulnFindingSeverity[]).map((s) => [s, 0]),
  ) as Record<VulnFindingSeverity, number>;
  const confidenceCounts: Record<ReportConfidence, number> = {
    CONFIRMED: 0,
    LIKELY: 0,
    INFO: 0,
  };
  for (const finding of findings) {
    counts[finding.severity] += 1;
    confidenceCounts[finding.confidence] += 1;
  }

  const scopeLine =
    input.logs.map((line) => SCOPE.exec(line)).find((m) => m !== null) ?? null;
  const scope = {
    root: scopeLine ? scopeLine[1] : null,
    includesSubdomains: scopeLine
      ? scopeLine[2] === 'and its subdomains'
      : null,
  };

  const stages = stagesFrom(profile, input.logs, terminal);
  const ranStages = new Set(
    stages
      .filter((s) => s.state === 'done' || s.state === 'failed')
      .map((s) => s.stage),
  );
  const tools = PIPELINE_TOOLS.filter(
    (tool) => !profile || PROFILE_STAGES[profile].includes(tool.stage),
  ).map((tool) => ({
    tool: tool.tool,
    version: tool.version,
    ran: ranStages.has(tool.stage),
  }));

  const { score, grade } = computeScore(findings);
  return {
    jobId: job.id,
    target,
    profile,
    status: job.status,
    score,
    grade,
    counts,
    confidenceCounts,
    scope,
    startedAt: (job.startedAt ?? job.createdAt).toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
    generatedAt: now.toISOString(),
    stages,
    tools,
    notTested: notTestedFor(profile, stages, scope.includesSubdomains),
    findings,
    incomplete: stages.some((s) => s.state === 'failed'),
    language: input.language,
    authorization: input.authorization ?? { kind: 'OWNERSHIP' },
  };
}
