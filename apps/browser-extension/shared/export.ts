// Export captured data as Markdown / JSON / HAR / TXT / ZIP / PDF.
// Runs wherever it's called from (popup/sidepanel/background all import
// this — it has no chrome.* dependency itself beyond `chrome.downloads`
// for saving the result, and `chrome.tabs.create` for the PDF path).

export interface ExportableCapture {
  id: string;
  type: string;
  pageUrl: string;
  savedAs: string;
  at: string;
  data?: string;
}

export function toMarkdown(captures: ExportableCapture[]): string {
  const lines = [`# PentestHub Capture Export`, ``, `Exported ${new Date().toISOString()} — ${captures.length} item(s)`, ``];
  for (const c of captures) {
    lines.push(`## ${c.type} — ${c.pageUrl}`, ``, `- Saved as: ${c.savedAs}`, `- Captured: ${c.at}`, ``);
    if (c.data) lines.push("```", c.data.slice(0, 5000), "```", "");
  }
  return lines.join("\n");
}

export function toJson(captures: ExportableCapture[]): string {
  return JSON.stringify({ exportedAt: new Date().toISOString(), count: captures.length, captures }, null, 2);
}

export function toTxt(captures: ExportableCapture[]): string {
  return captures.map((c) => `[${c.at}] ${c.type} — ${c.pageUrl}\n${c.data ?? ""}\n${"-".repeat(60)}`).join("\n\n");
}

/**
 * Minimal HAR 1.2 export — covers the fields that matter for a captured
 * request/response pair (method/url/headers/status/content). Not a full
 * HAR implementation (no timing breakdown, no cookies-as-HAR-cookies
 * structure) since the extension doesn't track that level of detail per
 * capture; good enough to import into Burp/ZAP/browser devtools for
 * replay, which is the actual use case for exporting HAR here.
 */
export function toHar(captures: Array<{ pageUrl: string; method?: string; status?: number; requestHeaders?: Record<string, string>; responseHeaders?: Record<string, string>; requestBody?: string; responseBody?: string }>): string {
  const entries = captures.map((c) => ({
    startedDateTime: new Date().toISOString(),
    time: 0,
    request: {
      method: c.method ?? "GET",
      url: c.pageUrl,
      httpVersion: "HTTP/1.1",
      headers: Object.entries(c.requestHeaders ?? {}).map(([name, value]) => ({ name, value })),
      queryString: [],
      cookies: [],
      headersSize: -1,
      bodySize: c.requestBody?.length ?? 0,
      postData: c.requestBody ? { mimeType: "text/plain", text: c.requestBody } : undefined,
    },
    response: {
      status: c.status ?? 0,
      statusText: "",
      httpVersion: "HTTP/1.1",
      headers: Object.entries(c.responseHeaders ?? {}).map(([name, value]) => ({ name, value })),
      cookies: [],
      content: { size: c.responseBody?.length ?? 0, mimeType: "text/plain", text: c.responseBody ?? "" },
      redirectURL: "",
      headersSize: -1,
      bodySize: c.responseBody?.length ?? 0,
    },
    cache: {},
    timings: { send: 0, wait: 0, receive: 0 },
  }));
  return JSON.stringify({ log: { version: "1.2", creator: { name: "PentestHub AI Browser Extension", version: "1.0" }, entries } }, null, 2);
}

export async function toZip(captures: ExportableCapture[]): Promise<Blob> {
  // Lazy-imported: `jszip` is only needed for this one export format, so
  // it's kept out of every other module that imports from `export.ts`
  // (including `tests/export.test.ts`, which exercises the
  // dependency-free Markdown/JSON/HAR paths without needing `jszip`
  // installed at all) and out of the background bundle's initial load.
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  zip.file("export.md", toMarkdown(captures));
  zip.file("export.json", toJson(captures));
  const folder = zip.folder("items")!;
  for (const c of captures) {
    if (c.data) folder.file(`${c.id}-${c.type}.txt`, c.data);
  }
  return zip.generateAsync({ type: "blob" });
}

/**
 * "PDF export" via the browser's own print-to-PDF, not a bundled PDF
 * engine — opens a formatted, print-styled HTML page in a new tab and
 * triggers `window.print()`; the user picks "Save as PDF" in the native
 * print dialog. This is the standard technique extensions use for PDF
 * output without shipping a PDF renderer (`pdf-lib`/`jsPDF` would add
 * real bundle weight for a feature used occasionally), and it produces a
 * genuinely nicer-looking PDF (real text, not a bitmap) than a hand-rolled
 * PDF writer would for this kind of report-style content.
 */
export function exportAsPdfViaPrint(captures: ExportableCapture[]): void {
  const html = buildPrintableHtml(captures);
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  chrome.tabs.create({ url }, (tab) => {
    if (!tab?.id) return;
    const listener = (tabId: number, info: chrome.tabs.TabChangeInfo) => {
      if (tabId === tab.id && info.status === "complete") {
        chrome.scripting.executeScript({ target: { tabId }, func: () => window.print() });
        chrome.tabs.onUpdated.removeListener(listener);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

function buildPrintableHtml(captures: ExportableCapture[]): string {
  const rows = captures
    .map(
      (c) => `<section style="page-break-inside:avoid;margin-bottom:24px;">
        <h2 style="font-size:14px;">${escapeHtml(c.type)} — ${escapeHtml(c.pageUrl)}</h2>
        <div style="font-size:11px;color:#666;">Saved as ${escapeHtml(c.savedAs)} · ${escapeHtml(c.at)}</div>
        ${c.data ? `<pre style="white-space:pre-wrap;font-size:11px;background:#f5f5f5;padding:8px;border-radius:4px;">${escapeHtml(c.data.slice(0, 5000))}</pre>` : ""}
      </section>`,
    )
    .join("\n");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>PentestHub Capture Export</title>
    <style>body{font-family:-apple-system,Segoe UI,sans-serif;padding:24px;color:#111;} h1{font-size:18px;}</style>
    </head><body><h1>PentestHub Capture Export</h1><div style="font-size:12px;color:#666;margin-bottom:16px;">Exported ${new Date().toISOString()} — ${captures.length} item(s)</div>${rows}</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function downloadText(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  downloadBlob(filename, blob);
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename, saveAs: true }, () => {
    // Revoke after a delay — the download needs the blob URL to still
    // be alive when the browser actually reads it, which happens
    // asynchronously after this callback fires.
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  });
}
