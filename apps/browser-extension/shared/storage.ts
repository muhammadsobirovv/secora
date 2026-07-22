// `chrome.storage.local` wrapper — the extension's only persistence
// (no IndexedDB needed at this scale: settings + a small recent-captures
// list + the paired bridge connection). `chrome.storage.local` rather
// than `.sync` deliberately: the pairing token is a machine-local secret
// tied to one Desktop Agent install and must never sync to the user's
// other browsers/devices via their Google/Firefox account.

import { DEFAULT_SETTINGS, type ExtensionSettings, type ExtensionState } from "./types";

const KEYS = {
  settings: "ph_settings",
  state: "ph_state",
} as const;

const DEFAULT_STATE: ExtensionState = {
  currentProjectId: null,
  currentTargetId: null,
  recentCaptures: [],
};

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get(KEYS.settings);
  return { ...DEFAULT_SETTINGS, ...(stored[KEYS.settings] as ExtensionSettings | undefined) };
}

export async function setSettings(settings: ExtensionSettings): Promise<void> {
  await chrome.storage.local.set({ [KEYS.settings]: settings });
}

export async function getState(): Promise<ExtensionState> {
  const stored = await chrome.storage.local.get(KEYS.state);
  return { ...DEFAULT_STATE, ...(stored[KEYS.state] as ExtensionState | undefined) };
}

export async function setState(patch: Partial<ExtensionState>): Promise<ExtensionState> {
  const current = await getState();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ [KEYS.state]: next });
  return next;
}

export async function pushRecentCapture(entry: ExtensionState["recentCaptures"][number]): Promise<void> {
  const state = await getState();
  const recentCaptures = [entry, ...state.recentCaptures].slice(0, 25);
  await setState({ recentCaptures });
}

export function onSettingsChanged(callback: (settings: ExtensionSettings) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === "local" && changes[KEYS.settings]) {
      callback(changes[KEYS.settings].newValue as ExtensionSettings);
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
