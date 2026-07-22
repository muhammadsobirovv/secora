// Target Capture — the ~19 one-click actions from the Module 8 spec.
// Orchestrates: (1) gathering the data, from either the content script
// (DOM-derived captures), `chrome.cookies` (cookies, including
// HttpOnly ones the content script's `document.cookie` can never see),
// or `shared/screenshot.ts` (screenshots) — then (2) the sensitivity
// check/confirmation gate, then (3) POSTing to the Bridge Server.

import { getClient } from "./bridge";
import { getState, pushRecentCapture, getSettings } from "../shared/storage";
import { isSensitiveCapture, sensitivityReason } from "../shared/sensitivity";
import { captureViewport } from "../shared/screenshot";
import { getCapturedHeaders, getCspHeader, getCorsHeaders, getSecurityHeaders } from "./network-capture";
import type { CaptureRequest, CaptureResponse, CaptureType, ExtensionResponse } from "../shared/types";

export interface CaptureContext {
  tab: chrome.tabs.Tab;
}

/**
 * Runs one capture end-to-end. `preConfirmed` is set when the caller
 * (popup/sidepanel) already showed the confirmation dialog itself before
 * invoking this — the context-menu path instead relies on this function
 * returning a `needsConfirmation` response and the background opening a
 * notification/popup prompt (see `notifyConfirmationNeeded`).
 */
export async function runCapture(captureType: CaptureType, ctx: CaptureContext, preConfirmed = false): Promise<ExtensionResponse<CaptureResponse>> {
  const state = await getState();
  if (!state.currentProjectId) {
    return { ok: false, error: "No current Project selected. Open the popup and pick a Project first." };
  }

  const client = await getClient();
  if (!client) return { ok: false, error: "Not paired with a Desktop Agent. Open Settings to pair." };

  const tab = ctx.tab;
  if (!tab.url) return { ok: false, error: "This tab has no URL to capture from." };

  const gathered = await gatherData(captureType, tab);
  const sensitive = isSensitiveCapture(captureType, gathered.data);

  const settings = await getSettings();
  const autoConfirm = sensitive ? false : settings.captureRules.autoConfirmNonSensitive;

  if (sensitive && !preConfirmed) {
    return { ok: false, error: `CONFIRMATION_REQUIRED: ${sensitivityReason(captureType, gathered.data)}` };
  }

  const request: CaptureRequest = {
    projectId: state.currentProjectId,
    targetId: state.currentTargetId ?? undefined,
    captureType,
    pageUrl: tab.url,
    data: gathered.data,
    dataBase64: gathered.dataBase64,
    mimeType: gathered.mimeType,
    tags: gathered.tags,
    sensitive,
    confirmed: sensitive ? preConfirmed : autoConfirm || preConfirmed || true,
  };

  try {
    const response = await client.post<CaptureRequest, CaptureResponse>("/api/captures", request);
    await pushRecentCapture({ id: response.id, type: captureType, pageUrl: tab.url, savedAs: response.savedAs, at: new Date().toISOString() });
    if (settings.notifications.onCaptureSaved) {
      chrome.notifications?.create({
        type: "basic",
        iconUrl: "public/icons/48.png",
        title: "Saved to PentestHub",
        message: `${captureType.replace(/_/g, " ")} from ${new URL(tab.url).hostname}`,
      });
    }
    return { ok: true, data: response };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Capture failed." };
  }
}

/** Maps a Side Panel AI action to the page context worth attaching to
 * the prompt — reuses the same data sources as Target Capture
 * (content script extraction / passive network capture) so there's one
 * "how do we read this page" implementation, not two. */
export async function gatherAiContext(action: string, tab: chrome.tabs.Tab): Promise<string | undefined> {
  const map: Record<string, CaptureType | undefined> = {
    "Explain Page": "html",
    "Analyze Forms": "forms",
    "Analyze JavaScript": "javascript",
    "Find Interesting Endpoints": "api_endpoints",
    "Analyze Security Headers": "security_headers",
    "Analyze CSP": "csp",
    "Analyze CORS": "cors",
    "Suggest Payloads": "forms",
    "Generate PoC": "forms",
    "Generate Report Draft": undefined,
    "Summarize Findings": undefined,
  };
  const captureType = map[action];
  if (!captureType) return undefined;
  const result = await gatherData(captureType, tab);
  return result.data;
}

interface GatheredData {
  data?: string;
  dataBase64?: string;
  mimeType?: string;
  tags?: string[];
}

async function gatherData(captureType: CaptureType, tab: chrome.tabs.Tab): Promise<GatheredData> {
  const url = tab.url!;

  switch (captureType) {
    case "url":
      return { data: url };
    case "domain":
      return { data: new URL(url).hostname };
    case "subdomain":
      return { data: new URL(url).hostname };
    case "cookies":
      return { data: JSON.stringify(await getCookiesForUrl(url), null, 2) };
    case "screenshot": {
      if (!tab.windowId) return {};
      const shot = await captureViewport(tab.windowId);
      const base64 = shot.dataUrl.split(",")[1];
      return { dataBase64: base64, mimeType: "image/png", tags: [`sha256:${shot.sha256}`] };
    }
    case "csp": {
      if (!tab.id) return {};
      const csp = getCspHeader(tab.id);
      return { data: csp ?? "(no Content-Security-Policy header observed on the main document)" };
    }
    case "cors": {
      if (!tab.id) return {};
      return { data: JSON.stringify(getCorsHeaders(tab.id), null, 2) };
    }
    case "security_headers": {
      if (!tab.id) return {};
      return { data: JSON.stringify(getSecurityHeaders(tab.id), null, 2) };
    }
    case "headers": {
      if (!tab.id) return {};
      const captured = getCapturedHeaders(tab.id);
      return { data: JSON.stringify(captured ?? {}, null, 2) };
    }
    case "request": {
      if (!tab.id) return {};
      const captured = getCapturedHeaders(tab.id);
      return { data: JSON.stringify({ url: captured?.url, headers: captured?.requestHeaders }, null, 2) };
    }
    case "response": {
      if (!tab.id) return {};
      const captured = getCapturedHeaders(tab.id);
      return { data: JSON.stringify({ url: captured?.url, status: captured?.status, headers: captured?.responseHeaders }, null, 2) };
    }
    case "html":
    case "javascript":
    case "forms":
    case "api_endpoints":
    case "graphql_endpoints":
    case "websocket_urls":
    case "local_storage":
    case "session_storage": {
      if (!tab.id) return {};
      const result = await requestFromContentScript(tab.id, captureType);
      return { data: result };
    }
    default:
      return {};
  }
}

/** "Selected Area" screenshot — captures the full viewport then crops to
 * the rect the content script's drag-select overlay reported, scaling
 * CSS pixels to device pixels (`captureVisibleTab` returns a
 * device-pixel-resolution image; the overlay's rect is in CSS pixels). */
export async function captureSelectedArea(tab: chrome.tabs.Tab, rect: { x: number; y: number; width: number; height: number }, devicePixelRatio: number): Promise<ExtensionResponse<CaptureResponse>> {
  const state = await getState();
  if (!state.currentProjectId) return { ok: false, error: "No current Project selected." };
  const client = await getClient();
  if (!client) return { ok: false, error: "Not paired with a Desktop Agent." };
  if (!tab.windowId || !tab.url) return { ok: false, error: "Invalid tab." };

  const { captureViewport: captureViewportFn, cropSelection } = await import("../shared/screenshot");
  const full = await captureViewportFn(tab.windowId);
  const scaled = { x: rect.x * devicePixelRatio, y: rect.y * devicePixelRatio, width: rect.width * devicePixelRatio, height: rect.height * devicePixelRatio };
  const cropped = await cropSelection(full.dataUrl, scaled);

  const request: CaptureRequest = {
    projectId: state.currentProjectId,
    targetId: state.currentTargetId ?? undefined,
    captureType: "screenshot",
    pageUrl: tab.url,
    dataBase64: cropped.dataUrl.split(",")[1],
    mimeType: "image/png",
    tags: [`sha256:${cropped.sha256}`, "selected-area"],
    sensitive: false,
    confirmed: true,
  };

  try {
    const response = await client.post<CaptureRequest, CaptureResponse>("/api/captures", request);
    await pushRecentCapture({ id: response.id, type: "screenshot", pageUrl: tab.url, savedAs: response.savedAs, at: new Date().toISOString() });
    return { ok: true, data: response };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Capture failed." };
  }
}

async function getCookiesForUrl(url: string): Promise<chrome.cookies.Cookie[]> {
  try {
    return await chrome.cookies.getAll({ url });
  } catch {
    return [];
  }
}

async function requestFromContentScript(tabId: number, captureType: CaptureType): Promise<string | undefined> {
  try {
    const response = (await chrome.tabs.sendMessage(tabId, { kind: "getPageContext", field: captureType })) as { data?: string } | undefined;
    return response?.data;
  } catch {
    // Content script isn't injected here (e.g. chrome:// pages, or the
    // page loaded before the extension did) — fail soft, the capture
    // just comes back empty rather than throwing.
    return undefined;
  }
}
