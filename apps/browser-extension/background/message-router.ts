// Central `chrome.runtime.onMessage` handler — every UI surface (popup,
// options, side panel, devtools panel) talks to the Desktop Agent only
// through messages routed here, since the background service worker is
// the only context holding the paired `BridgeClient` (see `bridge.ts`).

import { getClient, pair, unpair, getLiveSyncState, updateLiveSyncState } from "./bridge";
import { runCapture, captureSelectedArea, gatherAiContext } from "./capture-handlers";
import { runReconShortcut } from "./recon-shortcuts";
import { importProgramScope } from "./bugbounty-import";
import { getCapturedHeaders, getCorsHeaders, getSecurityHeaders } from "./network-capture";
import { getSettings, setSettings, getState, setState } from "../shared/storage";
import type { ExtensionMessage, ExtensionResponse, ProjectRecord, TargetRecord, FindingRecord, CreateFindingRequest, CreateNoteRequest } from "../shared/types";

type NoteResponseShim = { id: string };

export function registerMessageRouter(): void {
  chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
    handle(message, sender)
      .then(sendResponse)
      .catch((e: unknown) => sendResponse({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }));
    return true; // keep the message channel open for the async response
  });
}

async function handle(message: ExtensionMessage, sender: chrome.runtime.MessageSender): Promise<ExtensionResponse> {
  switch (message.kind) {
    case "capture": {
      const tab = sender.tab ?? (await getActiveTab());
      if (!tab) return { ok: false, error: "No active tab." };
      // Respects the caller's `confirmed` flag rather than assuming
      // true — popup/sidepanel send `confirmed: false` on the first
      // attempt, get back a `CONFIRMATION_REQUIRED` error if the data
      // turns out to be sensitive, show their own confirm dialog, then
      // resend with `confirmed: true`. See `shared/sensitivity.ts` for
      // what actually decides "sensitive" (the caller doesn't know
      // ahead of time — the background gathers the data first).
      return runCapture(message.payload.captureType, { tab }, message.payload.confirmed ?? false);
    }

    case "startJob": {
      const client = await getClient();
      if (!client) return { ok: false, error: "Not paired." };
      const result = await client.post("/api/jobs", message.payload);
      return { ok: true, data: result };
    }

    case "runReconShortcut": {
      const tab = await getActiveTab();
      if (!tab) return { ok: false, error: "No active tab." };
      await runReconShortcut(message.shortcut, tab);
      return { ok: true };
    }

    case "createFinding": {
      const client = await getClient();
      if (!client) return { ok: false, error: "Not paired." };
      // Callers (e.g. the DevTools panel's "Potential Findings" tab)
      // don't necessarily know the current Project id — same pattern as
      // "capture": the background fills it in from stored state rather
      // than trusting a possibly-stale/empty value from the caller.
      const state = await getState();
      if (!message.payload.projectId && !state.currentProjectId) return { ok: false, error: "No current Project selected." };
      const payload: CreateFindingRequest = { ...message.payload, projectId: message.payload.projectId || state.currentProjectId!, targetId: message.payload.targetId ?? state.currentTargetId ?? undefined };
      const finding = await client.post<CreateFindingRequest, FindingRecord>("/api/findings", payload);
      return { ok: true, data: finding };
    }

    case "createNote": {
      const client = await getClient();
      if (!client) return { ok: false, error: "Not paired." };
      const note = await client.post<CreateNoteRequest, NoteResponseShim>("/api/notes", message.payload);
      return { ok: true, data: note };
    }

    case "getState": {
      const state = await getState();
      const live = await getLiveSyncState();
      return { ok: true, data: { ...state, live } };
    }

    case "setCurrentProject": {
      await setState({ currentProjectId: message.projectId, currentTargetId: null });
      await updateLiveSyncState({ currentProjectId: message.projectId });
      return { ok: true };
    }

    case "setCurrentTarget": {
      await setState({ currentTargetId: message.targetId });
      await updateLiveSyncState({ currentTargetId: message.targetId });
      return { ok: true };
    }

    case "listProjects": {
      const client = await getClient();
      if (!client) return { ok: false, error: "Not paired." };
      const projects = await client.get<ProjectRecord[]>("/api/projects");
      return { ok: true, data: projects };
    }

    case "listTargets": {
      const client = await getClient();
      if (!client) return { ok: false, error: "Not paired." };
      const targets = await client.get<TargetRecord[]>(`/api/targets?projectId=${encodeURIComponent(message.projectId)}`);
      return { ok: true, data: targets };
    }

    case "getSettings": {
      return { ok: true, data: await getSettings() };
    }

    case "setSettings": {
      await setSettings(message.settings);
      return { ok: true };
    }

    case "testBridgeConnection": {
      const { BridgeClient } = await import("../shared/bridge-client");
      const trial = await BridgeClient.create({ baseUrl: message.baseUrl, token: message.token, pairedAt: new Date().toISOString() });
      const health = await trial.health();
      return { ok: !!health?.ok, data: health ?? undefined, error: health ? undefined : "Could not reach the Desktop Agent." };
    }

    case "pair": {
      const result = await pair(message.baseUrl, message.token);
      return { ok: result.ok, error: result.error };
    }

    case "unpair": {
      await unpair();
      return { ok: true };
    }

    case "captureScreenshot": {
      const tab = await getActiveTab();
      if (!tab) return { ok: false, error: "No active tab." };
      return runCapture("screenshot", { tab }, true);
    }

    case "bugBountyPlatformDetected": {
      // Recorded so the popup can show "Import scope from this page"
      // without re-querying the content script — see `popup/`'s state
      // hook, which reads `ph_detected_platform_<tabId>`.
      const tab = sender.tab;
      if (tab?.id !== undefined) {
        await chrome.storage.session.set({ [`ph_detected_platform_${tab.id}`]: { platform: message.platform, url: message.url } });
      }
      return { ok: true };
    }

    case "areaSelectionComplete": {
      const tab = sender.tab ?? (await getActiveTab());
      if (!tab) return { ok: false, error: "No active tab." };
      return captureSelectedArea(tab, message.rect, message.devicePixelRatio);
    }

    case "gatherAiContext": {
      const tab = await getActiveTab();
      if (!tab) return { ok: false, error: "No active tab." };
      const data = await gatherAiContext(message.action, tab);
      return { ok: true, data: { context: data, pageUrl: tab.url } };
    }

    case "getDevToolsSnapshot": {
      const { tabId } = message;
      let fromContent: Record<string, unknown> = {};
      try {
        fromContent = (await chrome.tabs.sendMessage(tabId, { kind: "getDevToolsSnapshot" })) as { data: Record<string, unknown> };
        fromContent = (fromContent as { data: Record<string, unknown> }).data;
      } catch {
        /* content script not present on this tab (e.g. chrome:// page) */
      }
      const captured = getCapturedHeaders(tabId);
      return {
        ok: true,
        data: {
          ...fromContent,
          requestHeaders: captured?.requestHeaders ?? {},
          responseHeaders: captured?.responseHeaders ?? {},
          cors: getCorsHeaders(tabId),
          security: getSecurityHeaders(tabId),
          cookiesUrl: captured?.url,
        },
      };
    }

    case "extractProgramScope": {
      const tab = await getActiveTab();
      if (!tab?.id) return { ok: false, error: "No active tab." };
      const response = (await chrome.tabs.sendMessage(tab.id, { kind: "extractProgramScope" })) as { data: unknown };
      return { ok: true, data: response.data };
    }

    case "importProgramScope": {
      const result = await importProgramScope(message.scope);
      return { ok: result.ok, data: { targetsCreated: result.targetsCreated }, error: result.error };
    }

    default:
      return { ok: false, error: `Unhandled message kind: ${(message as { kind: string }).kind}` };
  }
}

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}
