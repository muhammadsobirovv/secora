// Owns the single `BridgeClient` connection to the Desktop Agent's Local
// Bridge Server for the whole extension — every other background module
// (capture-handlers, recon-shortcuts, message-router) calls through
// here rather than constructing its own `BridgeClient`, so there's one
// place that knows whether we're currently paired/connected and one
// place the Live Sync WebSocket lives.

import { BridgeClient, BridgeError } from "../shared/bridge-client";
import { getSettings, setSettings } from "../shared/storage";
import type { BridgeConnection, LiveSyncState } from "../shared/types";

let client: BridgeClient | null = null;
let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const liveSyncListeners = new Set<(state: unknown) => void>();

export async function getClient(): Promise<BridgeClient | null> {
  if (client) return client;
  const settings = await getSettings();
  if (!settings.bridge) return null;
  client = await BridgeClient.create(settings.bridge);
  return client;
}

export async function isConnected(): Promise<boolean> {
  const c = await getClient();
  if (!c) return false;
  const health = await c.health();
  return health?.ok === true;
}

export async function pair(baseUrl: string, token: string): Promise<{ ok: boolean; error?: string }> {
  const trial = await BridgeClient.create({ baseUrl, token, pairedAt: new Date().toISOString() });
  const health = await trial.health();
  if (!health?.ok) return { ok: false, error: "Could not reach the Desktop Agent at that URL." };

  try {
    const result = await trial.post<{ token: string }, { valid: boolean; agentName: string; agentVersion: string }>("/api/pair", { token });
    if (!result.valid) return { ok: false, error: "Token was rejected by the Desktop Agent." };
  } catch (e) {
    return { ok: false, error: e instanceof BridgeError ? e.message : "Pairing request failed." };
  }

  const connection: BridgeConnection = { baseUrl, token, pairedAt: new Date().toISOString() };
  const settings = await getSettings();
  await setSettings({ ...settings, bridge: connection });
  client = trial;
  connectLiveSync();
  return { ok: true };
}

export async function unpair(): Promise<void> {
  const settings = await getSettings();
  await setSettings({ ...settings, bridge: null });
  client = null;
  disconnectLiveSync();
}

export function onLiveSyncMessage(callback: (data: unknown) => void): () => void {
  liveSyncListeners.add(callback);
  return () => liveSyncListeners.delete(callback);
}

export async function connectLiveSync(): Promise<void> {
  const c = await getClient();
  if (!c) return;
  disconnectLiveSync();
  socket = c.connectLiveSync(
    (data) => liveSyncListeners.forEach((cb) => cb(data)),
    () => {
      socket = null;
      // Exponential-ish backoff would be nicer, but a flat 5s retry is
      // fine here — a dead Desktop Agent means every retry fails fast
      // (connection refused), so this doesn't hot-loop meaningfully.
      reconnectTimer = setTimeout(connectLiveSync, 5000);
    },
  );
}

export function disconnectLiveSync(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  socket?.close();
  socket = null;
}

export async function getLiveSyncState(): Promise<LiveSyncState | null> {
  const c = await getClient();
  if (!c) return null;
  try {
    return await c.get<LiveSyncState>("/api/live-sync");
  } catch {
    return null;
  }
}

export async function updateLiveSyncState(patch: Partial<LiveSyncState>): Promise<void> {
  const c = await getClient();
  if (!c) return;
  try {
    await c.post("/api/live-sync", { ...patch, source: "extension" });
  } catch {
    /* best-effort — Live Sync is a convenience layer, not a source of truth */
  }
}
