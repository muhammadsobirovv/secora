// Background service worker entry point (event page on Firefox — see
// `manifest.firefox.json`'s `background.scripts` vs. `manifest.chrome
// .json`'s `background.service_worker`). Wires up context menus, the
// message router, network capture, keyboard commands, and Live Sync.

import { buildContextMenus, handleContextMenuClick } from "./context-menus";
import { registerMessageRouter } from "./message-router";
import { registerNetworkCapture } from "./network-capture";
import { connectLiveSync } from "./bridge";
import { runCapture } from "./capture-handlers";
import { KEYBOARD_COMMANDS } from "../shared/constants";
import { openSidePanel } from "../shared/platform";
import { getSettings } from "../shared/storage";

chrome.runtime.onInstalled.addListener(() => {
  buildContextMenus();
});

chrome.runtime.onStartup?.addListener(() => {
  buildContextMenus();
  void connectLiveSync();
});

registerMessageRouter();
registerNetworkCapture();
void connectLiveSync();

chrome.contextMenus.onClicked.addListener((info, tab) => handleContextMenuClick(info, tab));

chrome.commands.onCommand.addListener(async (command) => {
  const settings = await getSettings();
  if (!settings.keyboardShortcutsEnabled) return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  switch (command) {
    case KEYBOARD_COMMANDS.openSidePanel:
      if (tab.windowId !== undefined) await openSidePanel(tab.windowId, tab.id);
      break;
    case KEYBOARD_COMMANDS.captureUrl:
      await runCapture("url", { tab });
      break;
    case KEYBOARD_COMMANDS.captureScreenshot:
      await runCapture("screenshot", { tab });
      break;
    case KEYBOARD_COMMANDS.toggleVoice:
      // The side panel owns voice UI/state (it's the only surface with a
      // persistent DOM the Web Speech API can run in) — this just makes
      // sure it's open and lets it pick up the toggle via
      // `chrome.storage.session`.
      if (tab.windowId !== undefined) await openSidePanel(tab.windowId, tab.id);
      await chrome.storage.session.set({ ph_voice_toggle_requested: Date.now() });
      break;
  }
});

// Chrome-only: clicking the toolbar icon opens the popup by default
// (declared via `action.default_popup` in the manifest), so no explicit
// `chrome.action.onClicked` handler is needed — it only fires when
// `default_popup` is unset, which isn't the case here. Left unregistered
// intentionally (registering a no-op listener would be dead code).
