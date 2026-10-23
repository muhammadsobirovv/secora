import type {
  FindingExplanationDto,
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
  scopeText,
  authorizationRows,
  verificationName,
} from './report-text.js';

/// A small PDF writer, built in so exports need no browser and no dependency.
/// It draws the report with the standard Helvetica and Courier fonts, which
/// only cover Latin-1. Russian text is therefore transliterated to Latin
/// letters and Uzbek apostrophes are simplified; the HTML report (and the
/// browser's "Save as PDF") keeps the original alphabet. Nothing from the scan
/// is interpreted: it is only written out as escaped text.

const PAGE = { width: 595, height: 842, margin: 48 };

const CYRILLIC: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

/// Reduces text to what WinAnsi can show. Unknown characters become "?".
export function toWinAnsi(value: string): string {
  let out = '';
  for (const ch of value.normalize('NFC')) {
    const lower = ch.toLowerCase();
    if (CYRILLIC[lower] !== undefined) {
      const mapped = CYRILLIC[lower];
      out +=
        ch === lower
          ? mapped
          : mapped.charAt(0).toUpperCase() + mapped.slice(1);
      continue;
    }
    const code = ch.codePointAt(0) ?? 63;
    if (ch === '\n' || ch === '\t') out += ch === '\t' ? '    ' : ch;
    else if (ch === '‘' || ch === '’' || ch === 'ʻ' || ch === 'ʼ') out += "'";
    else if (ch === '“' || ch === '”' || ch === '«' || ch === '»') out += '"';
    else if (ch === '–' || ch === '—') out += '-';
    else if (ch === '…') out += '...';
    else if (code >= 32 && code < 127) out += ch;
    else if (code >= 160 && code <= 255) out += ch;
    else out += '?';
  }
  return out;
}

// Helvetica advance widths for ASCII 32..126 (per 1000 em).
const HELV = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278,
  278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584,
  584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556,
  833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278,
  278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222,
  500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500,
  500, 334, 260, 334, 584,
];

type FontKey = 'F1' | 'F2' | 'F3';

function width(str: string, font: FontKey, size: number): number {
  if (font === 'F3') return str.length * 0.6 * size;
  let total = 0;
  for (const ch of str) {
    const code = ch.charCodeAt(0);
    total += code >= 32 && code <= 126 ? HELV[code - 32] : 556;
  }
  return ((total * (font === 'F2' ? 1.06 : 1)) / 1000) * size;
}

function wrap(
  str: string,
  font: FontKey,
  size: number,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of str.split('\n')) {
    let current = '';
    for (const word of paragraph.split(/(\s+)/)) {
      if (word === '') continue;
      const candidate = current + word;
      if (width(candidate, font, size) <= maxWidth || current === '') {
        current = candidate;
        // A single unbroken token longer than the line (a URL, a hash) is cut.
        while (width(current, font, size) > maxWidth && current.length > 1) {
          let cut = current.length - 1;
          while (cut > 1 && width(current.slice(0, cut), font, size) > maxWidth)
            cut -= 1;
          lines.push(current.slice(0, cut));
          current = current.slice(cut);
        }
      } else {
        lines.push(current.trimEnd());
        current = word.trimStart();
      }
    }
    lines.push(current.trimEnd());
  }
  return lines;
}

const escapePdf = (s: string) =>
  [...s]
    .map((ch) => {
      const code = ch.charCodeAt(0);
      if (ch === '(' || ch === ')' || ch === '\\') return `\\${ch}`;
      if (code < 32 || code > 126)
        return `\\${code.toString(8).padStart(3, '0')}`;
      return ch;
    })
    .join('');

const COLORS = {
  text: '0.06 0.09 0.16',
  muted: '0.28 0.33 0.41',
  CRITICAL: '0.71 0.09 0.06',
  HIGH: '0.85 0.18 0.13',
  MEDIUM: '0.71 0.28 0.03',
  LOW: '0.09 0.36 0.83',
  INFO: '0.28 0.33 0.41',
} as const;

class Doc {
  private pages: string[][] = [[]];
  private y = PAGE.height - PAGE.margin;

  private ensure(height: number): void {
    if (this.y - height < PAGE.margin) {
      this.pages.push([]);
      this.y = PAGE.height - PAGE.margin;
    }
  }

  gap(points: number): void {
    this.y -= points;
  }

  line(
    str: string,
    opts: {
      font?: FontKey;
      size?: number;
      color?: string;
      indent?: number;
    } = {},
  ): void {
    const font = opts.font ?? 'F1';
    const size = opts.size ?? 10;
    const indent = opts.indent ?? 0;
    const lead = size * 1.35;
    for (const piece of wrap(
      toWinAnsi(str),
      font,
      size,
      PAGE.width - PAGE.margin * 2 - indent,
    )) {
      this.ensure(lead);
      this.y -= lead;
      this.pages[this.pages.length - 1].push(
        `BT /${font} ${size} Tf ${opts.color ?? COLORS.text} rg ${PAGE.margin + indent} ${this.y.toFixed(1)} Td (${escapePdf(piece)}) Tj ET`,
      );
    }
  }

  build(title: string): Buffer {
    const objects: string[] = [];
    const add = (body: string) => objects.push(body);
    add('<< /Type /Catalog /Pages 2 0 R >>');
    add(''); // pages, filled below
    const fonts = ['Helvetica', 'Helvetica-Bold', 'Courier'];
    fonts.forEach((name) =>
      add(
        `<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>`,
      ),
    );
    const pageIds: number[] = [];
    for (const page of this.pages) {
      const content = page.join('\n');
      add(
        `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
      );
      const contentId = objects.length;
      add(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${contentId} 0 R >>`,
      );
      pageIds.push(objects.length);
    }
    objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
    add(`<< /Title (${escapePdf(toWinAnsi(title))}) /Producer (Secora) >>`);

    let out = '%PDF-1.4\n';
    const offsets: number[] = [];
    objects.forEach((body, index) => {
      offsets.push(Buffer.byteLength(out, 'latin1'));
      out += `${index + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = Buffer.byteLength(out, 'latin1');
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets)
      out += `${String(offset).padStart(10, '0')} 00000 n \n`;
    out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(out, 'latin1');
  }
}

export function renderReportPdf(
  report: VulnReportDto,
  options: { explanations?: ReadonlyMap<string, FindingExplanationDto> } = {},
): Buffer {
  const l: ReportLanguage = report.language;
  const doc = new Doc();
  const heading = (s: string) => {
    doc.gap(10);
    doc.line(s, { font: 'F2', size: 13 });
    doc.gap(2);
  };

  doc.line(text(l, 'title'), { font: 'F2', size: 18 });
  doc.line(report.target.value, { color: COLORS.muted, size: 11 });
  doc.gap(6);
  doc.line(
    `${text(l, 'grade')}: ${report.grade}    ${text(l, 'score')}: ${report.score}/100`,
    { font: 'F2', size: 14 },
  );
  doc.line(
    (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as const)
      .map((s) => `${severityName(l, s)} ${report.counts[s]}`)
      .join('   '),
  );
  doc.line(
    (['CONFIRMED', 'LIKELY', 'INFO'] as const)
      .map((c) => `${confidenceName(l, c)} ${report.confidenceCounts[c]}`)
      .join('   '),
    { color: COLORS.muted },
  );
  doc.gap(6);
  const scope = scopeText(report);
  doc.line(`${text(l, 'profile')}: ${profileName(l, report.profile)}`);
  doc.line(`${text(l, 'scope')}: ${scope}`);
  for (const [label, value] of authorizationRows(report)) {
    doc.line(label ? `${label}: ${value}` : value, { color: COLORS.muted });
  }
  doc.line(`${text(l, 'started')}: ${report.startedAt}`);
  doc.line(`${text(l, 'finished')}: ${report.completedAt ?? '-'}`);
  doc.line(`${text(l, 'generated')}: ${report.generatedAt}`);

  heading(text(l, 'notTested'));
  doc.line(text(l, 'notTestedIntro'), { color: COLORS.muted });
  for (const item of report.notTested)
    doc.line(`- ${notTestedText(l, item)}`, { indent: 8 });

  heading(`${text(l, 'findings')} (${report.findings.length})`);
  if (report.findings.length === 0) doc.line(text(l, 'noFindings'));
  for (const finding of report.findings) {
    const provided = options.explanations?.get(finding.id);
    const what = provided?.whatIsThis ?? finding.builtIn.whatIsThis;
    const why = provided?.whyItMatters ?? finding.builtIn.whyItMatters;
    const fix = provided?.howToFix ?? finding.builtIn.howToFix;

    doc.gap(8);
    doc.line(
      `[${severityName(l, finding.severity)}] [${confidenceName(l, finding.confidence)}] ${finding.title}`,
      {
        font: 'F2',
        size: 11,
        color: COLORS[finding.severity],
      },
    );
    doc.line(`${text(l, 'affected')}: ${finding.affected}`, {
      color: COLORS.muted,
      size: 9,
    });
    doc.line(`${text(l, 'whatIsThis')}: ${what}`, { indent: 8 });
    doc.line(`${text(l, 'whyItMatters')}: ${why}`, { indent: 8 });
    doc.line(`${text(l, 'howToFix')}: ${fix}`, { indent: 8 });
    if (finding.snippet) {
      doc.line(finding.snippet.code, {
        font: 'F3',
        size: 8.5,
        indent: 16,
        color: COLORS.muted,
      });
    }
    doc.line(
      `${text(l, 'verification')}: ${verificationName(l, finding.verification.status)}`,
      { size: 9, color: COLORS.muted, indent: 8 },
    );
    for (const ref of finding.references.slice(0, 4))
      doc.line(ref, { size: 8, color: COLORS.muted, indent: 8 });
  }

  heading(text(l, 'stages'));
  for (const s of report.stages) {
    doc.line(
      `${stageName(l, s.stage)}: ${stateName(l, s.state)}${s.note ? ` - ${s.note}` : ''}`,
    );
  }
  heading(text(l, 'tools'));
  for (const t of report.tools) {
    doc.line(
      `${t.tool} ${t.version} - ${text(l, t.ran ? 'toolRan' : 'toolNotRun')}`,
    );
  }
  heading(text(l, 'methodology'));
  for (const key of ['method1', 'method2', 'method3'])
    doc.line(`- ${text(l, key)}`, { indent: 8 });
  doc.gap(8);
  doc.line(text(l, 'footer'), { size: 8, color: COLORS.muted });

  return doc.build(`${text(l, 'title')} - ${report.target.value}`);
}
