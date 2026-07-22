// Recon Shortcuts — right-click menu actions that dispatch a job to the
// Desktop Agent's tool runner (Recon/Nuclei/Directory Scan/HTTPX/Katana)
// against the current tab's domain, auto-creating a Target if one
// doesn't already exist for it under the current Project.

import { getClient } from "./bridge";
import { getState, setState } from "../shared/storage";
import type { StartJobRequest, StartJobResponse, TargetRecord } from "../shared/types";

export async function runReconShortcut(shortcut: StartJobRequest["shortcut"], tab: chrome.tabs.Tab): Promise<void> {
  const client = await getClient();
  if (!client || !tab.url) {
    notify("Not connected", "Pair with a Desktop Agent first (Settings).");
    return;
  }

  const state = await getState();
  if (!state.currentProjectId) {
    notify("No Project selected", "Open the popup and pick a Project first.");
    return;
  }

  const domain = new URL(tab.url).hostname;
  const targetId = await resolveTargetId(state.currentProjectId, state.currentTargetId, domain);
  if (!targetId) {
    notify("Could not resolve target", `Failed to find or create a target for ${domain}.`);
    return;
  }

  try {
    const response = await client.post<StartJobRequest, StartJobResponse>("/api/jobs", { projectId: state.currentProjectId, targetId, shortcut });
    notify("Job started", `${response.tool} is now running against ${domain}.`);
  } catch (e) {
    notify("Failed to start job", e instanceof Error ? e.message : "Unknown error");
  }
}

async function resolveTargetId(projectId: string, currentTargetId: string | null, domain: string): Promise<string | null> {
  const client = await getClient();
  if (!client) return null;

  if (currentTargetId) {
    const targets = await client.get<TargetRecord[]>(`/api/targets?projectId=${encodeURIComponent(projectId)}`);
    const existing = targets.find((t) => t.id === currentTargetId);
    if (existing) return existing.id;
  }

  const targets = await client.get<TargetRecord[]>(`/api/targets?projectId=${encodeURIComponent(projectId)}`);
  const match = targets.find((t) => t.value === domain);
  if (match) {
    await setState({ currentTargetId: match.id });
    return match.id;
  }

  // No existing target for this domain — save it as one via the
  // capture endpoint's target-upsert path (same dedup logic the
  // "Save current Domain" one-click action uses), then use that.
  const captureResult = await client.post<{ projectId: string; captureType: string; pageUrl: string; data: string }, { id: string }>("/api/captures", {
    projectId,
    captureType: "domain",
    pageUrl: `https://${domain}`,
    data: domain,
  });
  await setState({ currentTargetId: captureResult.id });
  return captureResult.id;
}

function notify(title: string, message: string): void {
  chrome.notifications?.create({ type: "basic", iconUrl: "public/icons/48.png", title, message });
}
