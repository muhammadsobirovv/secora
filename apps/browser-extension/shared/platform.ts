// Cross-browser normalization. `webextension-polyfill` gives every
// browser (Chrome/Edge/Brave/Opera/Firefox) the same Promise-based
// `browser.*` namespace instead of Chrome's callback-based `chrome.*`
// (Firefox has supported `browser.*` natively for years; Chromium-based
// browsers only get it via this polyfill) — every file in this
// extension should import `browser` from here instead of using the
// global `chrome` object directly, so the same source compiles to a
// working extension for both manifest variants.
//
// One real API-surface gap the polyfill does *not* paper over: Chrome's
// `chrome.sidePanel` (a true, resizable side panel) has no Firefox
// equivalent — Firefox instead has `browser.sidebarAction` (an older,
// less flexible sidebar API, see `manifest.firefox.json`'s
// `sidebar_action` key vs. `manifest.chrome.json`'s `side_panel` key).
// `openSidePanel`/`isSidePanelSupported` below is the one place that
// difference is handled, so `background/index.ts` doesn't need its own
// browser-sniffing.

import browser from "webextension-polyfill";

export { browser };

export function isFirefox(): boolean {
  // Firefox's `browser.runtime.getBrowserInfo` only exists in Firefox
  // (Chromium browsers don't implement it) — cheaper and more reliable
  // than user-agent sniffing, and works from the background service
  // worker / event page without needing DOM access.
  return typeof (browser.runtime as unknown as { getBrowserInfo?: unknown }).getBrowserInfo === "function";
}

export async function openSidePanel(windowId: number, tabId?: number): Promise<void> {
  const chromeSidePanel = (browser as unknown as { sidePanel?: { open: (opts: { windowId?: number; tabId?: number }) => Promise<void> } }).sidePanel;
  if (chromeSidePanel?.open) {
    await chromeSidePanel.open(tabId ? { tabId } : { windowId });
    return;
  }
  const firefoxSidebar = (browser as unknown as { sidebarAction?: { open: () => Promise<void> } }).sidebarAction;
  if (firefoxSidebar?.open) {
    await firefoxSidebar.open();
  }
}
