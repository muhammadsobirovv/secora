import type {
  BugBountyFinding,
  BugBountyProgram,
  BugReport,
  BugReportTemplate,
} from '../../../prisma-types.js';

export interface BugReportRenderInput {
  report: BugReport;
  program: BugBountyProgram;
  finding: BugBountyFinding | null;
}

function section(title: string, body: string | null | undefined): string {
  if (!body?.trim()) return '';
  return `## ${title}\n\n${body.trim()}\n\n`;
}

function referencesBlock(references: string[]): string {
  if (references.length === 0) return '';
  return `## References\n\n${references.map((r) => `- ${r}`).join('\n')}\n\n`;
}

/// Generic, fully-labeled Markdown — the default template and the base
/// every other template's content is derived from (HTML wraps this same
/// content; PDF is this same content handed to the export layer's
/// markdown-to-PDF conversion rather than a separately maintained format).
function renderMarkdown(input: BugReportRenderInput): string {
  const { report, finding } = input;
  let out = `# ${report.title}\n\n`;
  if (finding) {
    out += `**Severity:** ${finding.severity}`;
    if (report.cvssScore != null)
      out += ` (CVSS ${report.cvssScore}${report.cvssVector ? ` — ${report.cvssVector}` : ''})`;
    out += '\n\n';
  }
  if (finding?.endpoint)
    out += `**Affected Endpoint:** ${finding.endpoint}\n\n`;
  if (report.cwe) out += `**CWE:** ${report.cwe}\n\n`;
  out += section('Summary', report.summary);
  out += section('Steps to Reproduce', report.stepsToReproduce);
  out += section('Proof of Concept', report.proofOfConcept);
  out += section('Impact', report.impact);
  out += section('Suggested Mitigation', report.mitigation);
  out += referencesBlock(report.references);
  return out.trim() + '\n';
}

/// HackerOne's public report form groups fields as Summary / Description
/// (steps + PoC combined) / Impact — mirroring that grouping here so a
/// copy-paste into their form needs minimal re-editing.
function renderHackerOne(input: BugReportRenderInput): string {
  const { report, finding } = input;
  let out = `# ${report.title}\n\n`;
  out += section('Summary', report.summary);
  const description = [report.stepsToReproduce, report.proofOfConcept]
    .filter((v): v is string => !!v?.trim())
    .join('\n\n');
  out += section('Description', description);
  out += section('Impact', report.impact);
  if (finding)
    out += `**Weakness:** ${report.cwe ?? finding.vulnType ?? 'N/A'}\n\n`;
  out += referencesBlock(report.references);
  return out.trim() + '\n';
}

/// Bugcrowd's submission form: Bug Description / Steps to Reproduce /
/// Impact / Suggested Fix — kept as four distinct sections (unlike
/// HackerOne, Bugcrowd doesn't merge steps into the description).
function renderBugcrowd(input: BugReportRenderInput): string {
  const { report } = input;
  let out = `# ${report.title}\n\n`;
  out += section('Bug Description', report.summary);
  out += section('Steps to Reproduce', report.stepsToReproduce);
  out += section('Proof of Concept', report.proofOfConcept);
  out += section('Impact', report.impact);
  out += section('Suggested Fix', report.mitigation);
  out += referencesBlock(report.references);
  return out.trim() + '\n';
}

/// Intigriti's form leads with CVSS, then Description / PoC / Impact /
/// Recommendation.
function renderIntigriti(input: BugReportRenderInput): string {
  const { report } = input;
  let out = `# ${report.title}\n\n`;
  if (report.cvssScore != null) {
    out += `**CVSS Score:** ${report.cvssScore}${report.cvssVector ? ` (${report.cvssVector})` : ''}\n\n`;
  }
  out += section('Description', report.summary);
  out += section(
    'Proof of Concept',
    report.proofOfConcept ?? report.stepsToReproduce,
  );
  out += section('Impact', report.impact);
  out += section('Recommendation', report.mitigation);
  out += referencesBlock(report.references);
  return out.trim() + '\n';
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/// Minimal Markdown -> HTML for the handful of block types the templates
/// above actually produce (headings, paragraphs, bullet lists) — not a
/// general Markdown renderer, since report content never uses anything
/// beyond those.
function markdownToHtml(markdown: string): string {
  const lines = markdown.split('\n');
  const htmlLines: string[] = [];
  let inList = false;
  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (inList) {
        htmlLines.push('</ul>');
        inList = false;
      }
      htmlLines.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
    } else if (line.startsWith('# ')) {
      if (inList) {
        htmlLines.push('</ul>');
        inList = false;
      }
      htmlLines.push(`<h1>${escapeHtml(line.slice(2))}</h1>`);
    } else if (line.startsWith('- ')) {
      if (!inList) {
        htmlLines.push('<ul>');
        inList = true;
      }
      htmlLines.push(`<li>${escapeHtml(line.slice(2))}</li>`);
    } else if (line.trim() === '') {
      if (inList) {
        htmlLines.push('</ul>');
        inList = false;
      }
    } else {
      if (inList) {
        htmlLines.push('</ul>');
        inList = false;
      }
      htmlLines.push(`<p>${escapeHtml(line)}</p>`);
    }
  }
  if (inList) htmlLines.push('</ul>');
  return htmlLines.join('\n');
}

function renderHtml(input: BugReportRenderInput): string {
  const body = markdownToHtml(renderMarkdown(input));
  return `<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>${escapeHtml(
    input.report.title,
  )}</title></head><body>\n${body}\n</body></html>\n`;
}

/// Dispatches by BugReportTemplate. PDF has no dedicated layout of its own
/// here — it reuses the Markdown content, which the export layer (the pdf
/// generation step, wired alongside the other export formats) converts to
/// a PDF binary; keeping that conversion out of this pure text-rendering
/// function.
export function renderBugReportTemplate(
  template: BugReportTemplate,
  input: BugReportRenderInput,
): string {
  switch (template) {
    case 'HACKERONE':
      return renderHackerOne(input);
    case 'BUGCROWD':
      return renderBugcrowd(input);
    case 'INTIGRITI':
      return renderIntigriti(input);
    