// Right-click menu — Target Capture shortcuts + Recon Shortcuts, per the
// Module 8 spec. Built once on `chrome.runtime.onInstalled` (context
// menu items persist across service-worker restarts automatically, so
// this doesn't need to re-run on every wake).

import { CONTEXT_MENU_IDS } from "../shared/constants";
import { runCapture } from "./capture-handlers";
import { runReconShortcut } from "./recon-shortcuts";
import type { CaptureType } from "../shared/types";

export function buildContextMenus(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: CONTEXT_MENU_IDS.root, title: "PentestHub AI", contexts: ["page", "selection", "link", "image"] });

    const capture = (id: string, title: string) => chrome.contextMenus.create({ id, parentId: CONTEXT_MENU_IDS.root, title, contexts: ["page", "selection", "link", "image"] });

    capture(CONTEXT_MENU_IDS.saveUrl, "Save current URL");
    capture(CONTEXT_MENU_IDS.saveDomain, "Save current Domain");
    capture(CONTEXT_MENU_IDS.saveSubdomain, "Save current Subdomain");
    capture(CONTEXT_MENU_IDS.saveRequestResponse, "Save Request/Response");
    capture(CONTEXT_MENU_IDS.saveHeaders, "Save Headers");
    capture(CONTEXT_MENU_IDS.saveCookies, "Save Cookies");
    capture(CONTEXT_MENU_IDS.saveStorage, "Save LocalStorage/SessionStorage");
    capture(CONTEXT_MENU_IDS.saveScreenshot, "Save Screenshot");
    capture(CONTEXT_MENU_IDS.saveHtml, "Save HTML");
    capture(CONTEXT_MENU_IDS.saveJavascript, "Save JavaScript");
    capture(CONTEXT_MENU_IDS.saveForms, "Save Forms");
    capture(CONTEXT_MENU_IDS.saveEndpoints, "Save API/GraphQL/WebSocket Endpoints");
    capture(CONTEXT_MENU_IDS.saveSecurityPosture, "Save CSP/CORS/Security Headers");

    chrome.contextMenus.create({ id: CONTEXT_MENU_IDS.reconRoot, parentId: CONTEXT_MENU_IDS.root, title: "Recon Shortcuts", contexts: ["page"] });
    const recon = (id: string, title: string) => chrome.contextMenus.create({ id, parentId: CONTEXT_MENU_IDS.reconRoot, title, contexts: ["page"] });
    recon(CONTEXT_MENU_IDS.runRecon, "Run Recon");
    recon(CONTEXT_MENU_IDS.runNuclei, "Run Nuclei");
    recon(CONTEXT_MENU_IDS.runDirScan, "Run Directory Scan");
    recon(CONTEXT_MENU_IDS.runHttpx, "Run HTTPX");
    recon(CONTEXT_MENU_IDS.runKatana, "Run Katana");
    recon(CONTEXT_MENU_IDS.runScreenshot, "Run Screenshot");
    recon(CONTEXT_MENU_IDS.runAiAnalysis, "Run AI Analysis");
  });
}

const CAPTURE_MENU_TO_TYPE: Record<string, CaptureType> = {
  [CONTEXT_MENU_IDS.saveUrl]: "url",
  [CONTEXT_MENU_IDS.saveDomain]: "domain",
  [CONTEXT_MENU_IDS.saveSubdomain]: "subdomain",
  [CONTEXT_MENU_IDS.saveRequestResponse]: "request",
  [CONTEXT_MENU_IDS.saveHeaders]: "headers",
  [CONTEXT_MENU_IDS.saveCookies]: "cookies",
  [CONTEXT_MENU_IDS.saveStorage]: "local_storage",
  [CONTEXT_MENU_IDS.saveScreenshot]: "screenshot",
  [CONTEXT_MENU_IDS.saveHtml]: "html",
  [CONTEXT_MENU_IDS.saveJavascript]: "javascript",
  [CONTEXT_MENU_IDS.saveForms]: "forms",
  [CONTEXT_MENU_IDS.saveEndpoints]: "api_endpoints",
  [CONTEXT_MENU_IDS.saveSecurityPosture]: "security_headers",
};

const RECON_MENU_TO_SHORTCUT: Record<string, "recon" | "nuclei" | "dirscan" | "httpx" | "katana"> = {
  [CONTEXT_MENU_IDS.runRecon]: "recon",
  [CONTEXT_MENU_IDS.runNuclei]: "nuclei",
  [CONTEXT_MENU_IDS.runDirScan]: "dirscan",
  [CONTEXT_MENU_IDS.runHttpx]: "httpx",
  [CONTEXT_MENU_IDS.runKatana]: "katana",
};

export function handleContextMenuClick(info: chrome.contextMenus.OnClickData, tab: chrome.tabs.Tab | undefined): void {
  if (!tab) return;
  const menuId = String(info.menuItemId);

  const captureType = CAPTURE_MENU_TO_TYPE[menuId];
  if (captureType) {
    void runCapture(captureType, { tab }).then((result) => notifyResult(tab, captureType, result));
    return;
  }

  const shortcut = RECON_MENU_TO_SHORTCUT[menuId];
  if (shortcut) {
    void runReconShortcut(shortcut, tab);
    return;
  }

  if (menuId === CONTEXT_MENU_IDS.runScreenshot) {
    void runCapture("screenshot", { tab }).then((result) => notifyResult(tab, "screenshot", result));
    return;
  }

  if (menuId === CONTEXT_MENU_IDS.runAiAnalysis) {
    chrome.action.openPopup?.();
    // Opening the Side Panel and pre-filling "Explain Page" is handled
    // by `sidepanel/` reading `chrome.storage.session` for a pending
    // action — see `background/message-router.ts`'s `runAiAnalysis`.
    void chrome.storage.session.set({ ph_pending_ai_action: { action: "Explain Page", tabId: tab.id } });
    if (tab.windowId) void chrome.sidePanel?.open?.({ windowId: tab.windowId }).catch(() => {});
  }
}

function notifyResult(tab: chrome.tabs.Tab, label: string, result: { ok: boolean; error?: string }): void {
  if (result.ok) return;
  if (result.error?.startsWith("CONFIRMATION_REQUIRED")) {
    chrome.notifications?.create({
      type: "basic",
      iconUrl: "public/icons/48.png",
      title: "Confirmation needed",
      message: `"${label}" may contain sensitive data. Open the popup to confirm and save it.`,
    });
    return;
  }
  chrome.notifications?.create({ type: "basic", iconUrl: "public/icons/48.png", title: "Capture failed", message: result.error ?? "Unknown error" });
}
