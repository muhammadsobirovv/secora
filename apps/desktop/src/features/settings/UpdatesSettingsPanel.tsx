import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { check as checkForUpdate } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { DownloadCloud } from "lucide-react";
import { Button, Card, ErrorState } from "../../components/ui";

/// Auto Update — thin UI over `tauri-plugin-updater`, which does the
/// actual work: fetching the manifest from the endpoint configured in
/// `tauri.conf.json`, verifying its signature against the bundled ed25519
/// public key (see `security::mod`'s "Signed update verification" note),
/// downloading, and installing. No custom Rust command needed — the JS
/// plugin API talks to the updater directly.
export function UpdatesSettingsPanel() {
  const [status, setStatus] = useState<string>("");

  const checkMutation = useMutation({
    mutationFn: async () => {
      const update = await checkForUpdate();
      if (update?.available) {
        setStatus(`Update available: v${update.version} (currently v${update.currentVersion}).`);
        return update;
      }
      setStatus("You're on the latest version.");
      return null;
    },
  });

  const installMutation = useMutation({
    mutationFn: async () => {
      const update = checkMutation.data;
      if (!update) return;
      setStatus("Downloading update…");
      await update.downloadAndInstall((event) => {
        if (event.event === "Progress") {
          setStatus(`Downloading update… ${event.data.chunkLength} bytes`);
        }
      });
      setStatus("Update installed. Restarting…");
      await relaunch();
    },
  });

  return (
    <Card style={{ padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Software updates</div>
      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="outline" loading={checkMutation.isPending} onClick={() => checkMutation.mutate()}>
          <DownloadCloud size={14} /> Check for updates
        </Button>
        {checkMutation.data?.available && (
          <Button variant="primary" loading={installMutation.isPending} onClick={() => installMutation.mutate()}>
            Install & Restart
          </Button>
        )}
      </div>
      {status && <div style={{ marginTop: 10, fontSize: 12, color: "var(--color-text-muted)" }}>{status}</div>}
      {checkMutation.isError && <ErrorState message={(checkMutation.error as Error).message} />}
    </Card>
  );
}
