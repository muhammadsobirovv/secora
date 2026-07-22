import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { save as saveDialog, open as openDialog } from "@tauri-apps/plugin-dialog";
import { ShieldCheck } from "lucide-react";
import { desktopApi } from "../../lib/tauri-client";
import { Button, Card, ErrorState } from "../../components/ui";

/// Security & Storage — surfaces the mechanisms documented in
/// `src-tauri/src/security/mod.rs`: credential storage/local encryption
/// are always-on (nothing to toggle), so this page's interactive part is
/// the encrypted backup/restore flow built on top of them.
export function SecuritySettingsPanel() {
  const [status, setStatus] = useState<string | null>(null);

  const backupMutation = useMutation({
    mutationFn: async () => {
      const dest = await saveDialog({ defaultPath: "pentesthub-backup.enc", filters: [{ name: "Encrypted Backup", extensions: ["enc"] }] });
      if (!dest) return;
      await desktopApi.createEncryptedBackup(dest);
      setStatus(`Backup saved to ${dest}`);
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async () => {
      const source = await openDialog({ filters: [{ name: "Encrypted Backup", extensions: ["enc"] }] });
      if (!source || Array.isArray(source)) return;
      const restoredPath = await desktopApi.restoreEncryptedBackup(source);
      setStatus(`Restored to ${restoredPath}. Restart the app pointed at this file to use it.`);
    },
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <ShieldCheck size={16} color="var(--color-success)" />
          <div style={{ fontSize: 13, fontWeight: 600 }}>Always-on protections</div>
        </div>
        <ul style={{ fontSize: 12.5, color: "var(--color-text-muted)", lineHeight: 1.8, margin: 0, paddingLeft: 18 }}>
          <li>AI provider keys and sync tokens are stored in your OS keychain, never in plain SQLite.</li>
          <li>Every tool/plugin subprocess is spawned with an explicit argument list — never a shell string.</li>
          <li>The webview is restricted to a strict Content-Security-Policy (no remote script execution).</li>
          <li>Auto-updates are cryptographically signed and verified before being applied.</li>
        </ul>
      </Card>

      <Card style={{ padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Encrypted backup</div>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 10 }}>
          Exports a snapshot of your local database encrypted with AES-256-GCM, keyed by a secret stored in your OS keychain — safe to copy to a USB drive or cloud-synced folder.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="primary" loading={backupMutation.isPending} onClick={() => backupMutation.mutate()}>
            Export encrypted backup
          </Button>
          <Button variant="outline" loading={restoreMutation.isPending} onClick={() => restoreMutation.mutate()}>
            Restore from backup
          </Button>
        </div>
        {status && <div style={{ marginTop: 10, fontSize: 12, color: "var(--color-success)" }}>{status}</div>}
        {backupMutation.isError && <ErrorState message={(backupMutation.error as Error).message} />}
        {restoreMutation.isError && <ErrorState message={(restoreMutation.error as Error).message} />}
      </Card>
    </div>
  );
}
