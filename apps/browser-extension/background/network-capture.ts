// Passive network capture via `chrome.webRequest` (observe-only — MV3
// still allows non-blocking `webRequest` listeners, just not the
// `blocking` extraInfoSpec that lets you mutate requests, which this
// extension doesn't need). Keeps a small rolling buffer of the main
// document request's response headers per tab, which is what backs the
// "Save Headers" / "Save CSP" / "Save CORS" / "Save Security Headers"
// captures for the *main navigation* — capturing headers for arbitrary
// sub-resource requests (XHR/fetch made by the page) is out of scope for
// this extension (that's what the Burp Suite Extension / a proxy is
// for); this covers "what did the page itself get served with", which
// is what a bug bounty hunter clicking "Save Security Headers" on the
// page they're looking at actually wants.

interface CapturedHeaders {
  url: string;
  status: number;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  capturedAt: number;
}

const byTabId = new Map<number, CapturedHeaders>();
const MAX_AGE_MS = 5 * 60 * 1000;

export function registerNetworkCapture(): void {
  chrome.webRequest.onSendHeaders.addListener(
    (details) => {
      if (details.type !== "main_frame" || details.tabId < 0) return;
      const existing = byTabId.get(details.tabId);
      byTabId.set(details.tabId, {
        url: details.url,
        status: existing?.status ?? 0,
        requestHeaders: headersToRecord(details.requestHeaders),
        responseHeaders: existing?.responseHeaders ?? {},
        capturedAt: Date.now(),
      });
    },
    { urls: ["<all_urls>"] },
    ["requestHeaders"],
  );

  chrome.webRequest.onHeadersReceived.addListener(
    (details) => {
      if (details.type !== "main_frame" || details.tabId < 0) return;
      const existing = byTabId.get(details.tabId);
      byTabId.set(details.tabId, {
        url: details.url,
        status: details.statusCode,
        requestHeaders: existing?.requestHeaders ?? {},
        responseHeaders: headersToRecord(details.responseHeaders),
        capturedAt: Date.now(),
      });
    },
    { urls: ["<all_urls>"] },
    ["responseHeaders"],
  );

  chrome.tabs.onRemoved.addListener((tabId) => byTabId.delete(tabId));

  // Periodic cleanup so a long-lived tab that never re-navigates doesn't
  // hold stale headers forever if the user later navigates via
  // history.pushState (SPA) without a new main_frame request.
  chrome.alarms.create("ph-network-capture-gc", { periodInMinutes: 5 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== "ph-network-capture-gc") return;
    const now = Date.now();
    for (const [tabId, entry] of byTabId) {
      if (now - entry.capturedAt > MAX_AGE_MS) byTabId.delete(tabId);
    }
  });
}

export function getCapturedHeaders(tabId: number): CapturedHeaders | null {
  return byTabId.get(tabId) ?? null;
}

export function getCspHeader(tabId: number): string | null {
  const captured = byTabId.get(tabId);
  if (!captured) return null;
  return findHeader(captured.responseHeaders, "content-security-policy") ?? findHeader(captured.responseHeaders, "content-security-policy-report-only");
}

export function getCorsHeaders(tabId: number): Record<string, string> {
  const captured = byTabId.get(tabId);
  if (!captured) return {};
  const corsKeys = ["access-control-allow-origin", "access-control-allow-credentials", "access-control-allow-methods", "access-control-allow-headers", "access-control-expose-headers"];
  const result: Record<string, string> = {};
  for (const key of corsKeys) {
    const value = findHeader(captured.responseHeaders, key);
    if (value) result[key] = value;
  }
  return result;
}

export function getSecurityHeaders(tabId: number): Record<string, string> {
  const captured = byTabId.get(tabId);
  if (!captured) return {};
  const securityKeys = [
    "content-security-policy",
    "strict-transport-security",
    "x-frame-options",
    "x-content-type-options",
    "referrer-policy",
    "permissions-policy",
    "x-xss-protection",
    "cross-origin-opener-policy",
    "cross-origin-embedder-policy",
    "cross-origin-resource-policy",
  ];
  const result: Record<string, string> = {};
  for (const key of securityKeys) {
    const value = findHeader(captured.responseHeaders, key);
    result[key] = value ?? "(not set)";
  }
  return result;
}

function headersToRecord(headers?: chrome.webRequest.HttpHeader[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const h of headers ?? []) {
    if (h.name && h.value !== undefined) record[h.name] = h.value;
  }
  return record;
}

function findHeader(headers: Record<string, string>, name: string): string | null {
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : null;
}
