import type {
  FindingExplanationDto,
  ReportFindingDto,
  ReportLanguage,
  VulnReportDto,
} from '@pentesthub/shared';
import {
  confidenceName,
  notTestedText,
  profileName,
  severityName,
  stageName,
  stateName,
  text,
  verificationName,
} from './report-text.js';
import { STACK_LABEL, type StackId } from './stack-snippets.js';

/// Server-rendered, self-contained report page (no script, no external file).
/// Every value is escaped; the page is served with a CSP that allows nothing
/// but its own inline style, so even a title that slipped through cannot run.
/// It reads well at 360 px and prints cleanly (the browser's "Save as PDF" gives
/// a PDF with full Unicode; see report.pdf.ts for the built-in PDF).

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const e = escapeHtml;

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: '#b42318',
  HIGH: '#d92d20',
  MEDIUM: '#b54708',
  LOW: '#175cd3',
  INFO: '#475467',
};

const CSS = `
:root{color-scheme:light dark;--bg:#fff;--fg:#101828;--muted:#475467;--line:#d0d5dd;--card:#f9fafb;--accent:#175cd3;--code:#f2f4f7}
@media (prefers-color-scheme:dark){:root{--bg:#0c111d;--fg:#f2f4f7;--muted:#98a2b3;--line:#344054;--card:#161b26;--accent:#84caff;--code:#1d2939}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;overflow-wrap:anywhere}
main{max-width:860px;margin:0 auto;padding:16px}
h1{font-size:1.5rem;margin:0 0 4px}h2{font-size:1.2rem;margin:28px 0 8px;border-bottom:1px solid var(--line);padding-bottom:4px}h3{font-size:1rem;margin:12px 0 4px}
.muted{color:var(--muted)}.small{font-size:.875rem}
.score{display:flex;gap:16px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin:12px 0}
.grade{font-size:2.5rem;font-weight:700;line-height:1;min-width:56px;text-align:center}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}
.chip{border:1px solid var(--line);border-radius:999px;padding:2px 10px;font-size:.875rem}
.badge{display:inline-block;border-radius:6px;color:#fff;padding:1px 8px;font-size:.8rem;font-weight:600}
dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 12px;margin:0}dt{color:var(--muted)}dd{margin:0}
article{border:1px solid var(--line);border-radius:12px;background:var(--card);padding:12px;margin:12px 0;break-inside:avoid}
article h3{margin-top:6px}
pre{background:var(--code);border-radius:8px;padding:10px;overflow:auto;font:13px/1.4 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;word-break:break-all;margin:6px 0}
details summary{cursor:pointer;min-height:44px;display:flex;align-items:center}
ul{padding-left:20px;margin:6px 0}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid var(--line);padding:6px 4px;text-align:left;vertical-align:top}
@media print{body{background:#fff;color:#000}main{max-width:none;padding:0}details{display:block}details>summary{display:none}article{break-inside:avoid}a{color:#000}.noprint{display:none}}
`;

function explanationFor(
  finding: ReportFindingDto,
  language: ReportLanguage,
  provided: FindingExplanationDto | undefined,
) {
  if (provided) {
    return {
      what: provided.whatIsThis,
      why: provided.whyItMatters,
      fix: provided.howToFix,
      note:
        provided.source === 'AI'
          ? text(language, 'aiExplained')
          : text(language, 'builtInExplained'),
    };
  }
  return {
    what: finding.builtIn.whatIsThis,
    why: finding.builtIn.whyItMatters,
    fix: finding.builtIn.howToFix,
    note: '',
  };
}

function badge(label: string, color: string): string {
  return `<span class="badge" style="background:${color}">${e(label)}</span>`;
}

function findingHtml(
  finding: ReportFindingDto,
  language: ReportLanguage,
  explanations: ReadonlyMap<string, FindingExplanationDto> | undefined,
): string {
  const l = language;
  const explanation = explanationFor(finding, l, explanations?.get(finding.id));
  const evidence = [
    [text(l, 'request'), finding.evidence.request],
    [text(l, 'response'), finding.evidence.response],
    [text(l, 'payload'), finding.evidence.payload],
  ].filter((pair): pair is [string, string] => Boolean(pair[1]));
  const stackLabel = finding.stack ? STACK_LABEL[finding.stack as StackId] : '';
  const links = finding.references
    .filter((ref) => /^https?:\/\//i.test(ref))
    .map(
      (ref) =>
        `<li><a href="${e(ref)}" rel="noopener noreferrer">${e(ref)}</a></li>`,
    )
    .join('');
  const ids = [finding.cwe, ...finding.cves]
    .filter(Boolean)
    .map((id) => e(String(id)))
    .join(', ');

  return `<article>
<div>${badge(severityName(l, finding.severity), SEVERITY_COLOR[finding.severity])} <span class="chip">${e(confidenceName(l, finding.confidence))}</span></div>
<h3>${e(finding.title)}</h3>
<p class="muted small">${e(text(l, 'affected'))}: ${e(finding.affected)}${ids ? ` · ${ids}` : ''}</p>
<h4>${e(text(l, 'whatIsThis'))}</h4><p>${e(explanation.what)}</p>
<h4>${e(text(l, 'whyItMatters'))}</h4><p>${e(explanation.why)}</p>
<h4>${e(text(l, 'howToFix'))}</h4><p>${e(explanation.fix)}</p>
${finding.snippet ? `<p class="small muted">${e(text(l, 'exampleFor', { stack: stackLabel || finding.snippet.stack }))}</p><pre>${e(finding.snippet.code)}</pre>` : ''}
${explanation.note ? `<p class="small muted">${e(explanation.note)}</p>` : ''}
<p class="small"><strong>${e(text(l, 'verification'))}:</strong> ${e(verificationName(l, finding.verification.status))}${finding.verification.detail ? ` — ${e(finding.verification.detail)}` : ''}</p>
<p class="small muted">${e(text(l, 'reportedBy'))}: ${e([...new Set(finding.sources.map((s) => s.tool))].join(', '))}</p>
${evidence.length ? `<details><summary>${e(text(l, 'evidence'))}</summary>${evidence.map(([label, body]) => `<h4>${e(label)}</h4><pre>${e(body)}</pre>`).join('')}</details>` : ''}
${links ? `<h4>${e(text(l, 'references'))}</h4><ul>${links}</ul>` : ''}
</article>`;
}

export function renderReportHtml(
  report: VulnReportDto,
  options: { explanations?: ReadonlyMap<string, FindingExplanationDto> } = {},
): string {
  const l = report.language;
  const scope =
    report.scope.root === null
      ? text(l, 'scopeUnknown')
      : text(l, report.scope.includesSubdomains ? 'scopeApex' : 'scopeHost', {
          root: report.scope.root,
        });
  const date = (iso: string | null) =>
    iso
      ? iso
          .replace('T', ' ')
          .replace(/\.\d+Z$/, ' UTC')
          .replace(/Z$/, ' UTC')
      : '—';
  const chips = (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as const)
    .map(
      (s) =>
        `<span class="chip">${badge(severityName(l, s), SEVERITY_COLOR[s])} ${report.counts[s]}</span>`,
    )
    .join('');
  const confidenceChips = (['CONFIRMED', 'LIKELY', 'INFO'] as const)
    .map(
      (c) =>
        `<span class="chip">${e(confidenceName(l, c))} ${report.confidenceCounts[c]}</span>`,
    )
    .join('');

  return `<!doctype html>
<html lang="${l}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; base-uri 'none'; form-action 'none'">
<title>${e(text(l, 'title'))} — ${e(report.target.value)}</title>
<style>${CSS}</style>
</head>
<body>
<main>
<h1>${e(text(l, 'title'))}</h1>
<p class="muted">${e(report.target.value)}</p>

<section class="score" aria-label="${e(text(l, 'summary'))}">
<div class="grade" aria-label="${e(text(l, 'grade'))}">${e(report.grade)}</div>
<div><strong>${e(text(l, 'score'))}: ${report.score}/100</strong>
<div class="chips">${chips}</div>
<div class="chips">${confidenceChips}</div></div>
</section>

<dl>
<dt>${e(text(l, 'target'))}</dt><dd>${e(report.target.value)}</dd>
<dt>${e(text(l, 'profile'))}</dt><dd>${e(profileName(l, report.profile))}</dd>
<dt>${e(text(l, 'scope'))}</dt><dd>${e(scope)}</dd>
<dt>${e(text(l, 'started'))}</dt><dd>${e(date(report.startedAt))}</dd>
<dt>${e(text(l, 'finished'))}</dt><dd>${e(date(report.completedAt))}</dd>
<dt>${e(text(l, 'status'))}</dt><dd>${e(report.status)}</dd>
<dt>${e(text(l, 'generated'))}</dt><dd>${e(date(report.generatedAt))}</dd>
</dl>

<h2>${e(text(l, 'notTested'))}</h2>
<p class="muted">${e(text(l, 'notTestedIntro'))}</p>
<ul>${report.notTested.map((item) => `<li>${e(notTestedText(l, item))}</li>`).join('')}</ul>

<h2>${e(text(l, 'findings'))} (${report.findings.length})</h2>
${report.findings.length === 0 ? `<p>${e(text(l, 'noFindings'))}</p>` : report.findings.map((f) => findingHtml(f, l, options.explanations)).join('\n')}

<h2>${e(text(l, 'stages'))}</h2>
<table><tbody>${report.stages
    .map(
      (s) =>
        `<tr><td>${e(stageName(l, s.stage))}</td><td>${e(stateName(l, s.state))}</td><td class="muted small">${e(s.note ?? '')}</td></tr>`,
    )
    .join('')}</tbody></table>

<h2>${e(text(l, 'tools'))}</h2>
<table><tbody>${report.tools
    .map(
      (t) =>
        `<tr><td>${e(t.tool)}</td><td>${e(t.version)}</td><td class="muted small">${e(text(l, t.ran ? 'toolRan' : 'toolNotRun'))}</td></tr>`,
    )
    .join('')}</tbody></table>

<h2>${e(text(l, 'methodology'))}</h2>
<ul><li>${e(text(l, 'method1'))}</li><li>${e(text(l, 'method2'))}</li><li>${e(text(l, 'method3'))}</li></ul>
<p class="muted small">${e(text(l, 'footer'))}</p>
</main>
</body>
</html>`;
}

/// Sent with the HTML so that nothing but the page's own inline style can load.
export const REPORT_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
