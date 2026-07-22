// Typed wrapper over `chrome.runtime.sendMessage` — every UI surface
// (popup/options/sidepanel/devtools panel) sends messages to the
// background service worker through this instead of calling
// `chrome.runtime.sendMessage` with a raw string, mirroring the Desktop
// Agent's `lib/tauri-client.ts` "one seam" convention.

import type { ExtensionMessage, ExtensionResponse } from "./types";

export async function send<T = unknown>(message: ExtensionMessage): Promise<T> {
  const response = (await chrome.runtime.sendMessage(message)) as ExtensionResponse<T>;
  if (!response?.ok) throw new Error(response?.error ?? "Unknown extension error");
  return response.data as T;
}

/** Same as `send`, but resolves the raw response instead of throwing on
 * `ok: false` — used where the caller needs to distinguish
 * "confirmation required" from a hard failure (see `popup/`'s capture
 * grid, which shows a confirm dialog on `CONFIRMATION_REQUIRED`). */
export async function sendRaw<T = unknown>(message: ExtensionMessage): Promise<ExtensionResponse<T>> {
  return (await chrome.runtime.sendMessage(message)) as ExtensionResponse<T>;
}
