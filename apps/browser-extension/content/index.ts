// Content script entry point — injected into every page
// (`document_idle`, main frame only; see `manifest.*.json`). Handles:
// (1) `getPageContext` requests from the background service worker for
// Target Capture, (2) bug bounty program page auto-detection, and
// (3) the drag-to-select overlay for "Selected Area" screenshots.

import { extractHtml, extractJavaScript, extractForms, extractApiEndpoints, extractGraphqlEndpoints, extractWebSocketUrls, extractLocalStorage, extractSessionStorage, detectTechnology, extractInterestingParameters } from "./page-inspector";
import { detectPlatform, extractProgramScope } from "./bugbounty-scope";
import { startAreaSelection } from "./area-selection";
import type { CaptureType } from "../shared/types";

chrome.runtime.onMessage.addListener((message: { kind: string; field?: CaptureType }, _sender, sendResponse) => {
  if (message.kind === "getPageContext" && message.field) {
    void resolveField(message.field).then((data) => sendResponse({ data }));
    return true;
  }
  if (message.kind === "extractProgramScope") {
    sendResponse({ data: extractProgramScope() });
    return false;
  }
  if (message.kind === "getDevToolsSnapshot") {
    sendResponse({
      data: {
        forms: extractForms(),
        apiEndpoints: extractApiEndpoints(),
        graphqlEndpoints: extractGraphqlEndpoints(),
        websocketUrls: extractWebSocketUrls(),
        localStorage: extractLocalStorage(),
        sessionStorage: extractSessionStorage(),
        technology: detectTechnology(),
        interestingParameters: extractInterestingParameters(),
      },
    });
    return false;
  }
  if (message.kind === "startAreaSelection") {
    startAreaSelection((rect) => {
      chrome.runtime.sendMessage({ kind: "areaSelectionComplete", rect, devicePixelRatio: window.devicePixelRatio });
    });
    sendResponse({ ok: true });
    return false;
  }
  return false;
});

async function resolveField(field: CaptureType): Promise<string | undefined> {
  switch (field) {
    case "html":
      return extractHtml();
    case "javascript":
      return extractJavaScript();
    case "forms":
      return extractForms();
    case "api_endpoints":
      return extractApiEndpoints();
    case "graphql_endpoints":
      return extractGraphqlEndpoints();
    case "websocket_urls":
      return extractWebSocketUrls();
    case "local_storage":
      return extractLocalStorage();
    case "session_storage":
      return extractSessionStorage();
    default:
      return undefined;
  }
}

// Bug bounty program page auto-detection — tells the background worker
// so the popup can surface an "Import scope from this page" action
// without polling. Runs once per page load; SPA client-side navigation
// within the same platform (e.g. HackerOne's React router) won't
// re-trigger this without a full reload, which is an accepted gap (the
// user can always re-open the popup, which asks fresh via
// `extractProgramScope` on demand rather than relying solely on this
// push).
const platform = detectPlatform();
if (platform) {
  chrome.runtime.sendMessage({ kind: "bugBountyPlatformDetected", platform, url: location.href }).catch(() => {});
}
