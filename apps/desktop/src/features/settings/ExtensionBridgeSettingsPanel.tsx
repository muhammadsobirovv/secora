import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Puzzle, Copy, RefreshCw } from "lucide-react";
import { desktopApi } from "../../lib/tauri-client";
import { Button, Card, ErrorState, Spinner } from "../../components/ui";

/// Settings > Browser Extension — pairing info for the Module 8 Bridge
/// Server (`src-tauri/src/bridge/mod.rs`). The token is shown in
/// plaintext here (and only here — see `bridge_commands.rs`'s doc
/// comment) since Tauri IPC is already a trusted local channel; the user
/// copies it into the extension's Options page or the Burp extension's
/// config tab to complete pairing.
export function ExtensionBridgeSettingsPanel() {
  const [copied, setCopied] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const infoQuery = useQuery({ queryKey: ["bridge-info"], queryFn: () => desktopApi.getBridgeInfo(), retry: 1 });

  const rotateMutation = useMutation({
    mutationFn: () => desktopApi.regenerateBridgeToken(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bridge-info"] }),
  });

  const copy = async (label: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  if (infoQuery.isLoading) return <Spinner />;

  if (infoQuery.isError || !infoQuery.data) {
    return (
      <ErrorState
        message="Bridge Server unavailable — the local server that the Browser Extension and Burp Suite Extension connect to failed to start. Restart the app; if this persists, check the app logs."
        onRetry={() => infoQuery.refetch()}
      />
    );
  }

  const info = infoQuery.data;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Puzzle size={16} color="var(--color-primary)" />
          <div style={{ fontSize: 13, fontWeight: 600 }}>Browser Extension & Burp Suite Extension</div>
        </div>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 14, lineHeight: 1.6 }}>
          Paste these into the PentestHub browser extension's Options page (Desktop Agent Connection section) or the Burp Suite extension's config tab to pair them with this Desktop Agent. The connection is local-only (never leaves 127.0.0.1) and every request/response body is AES-256-GCM encrypted using a key derived from this token.
        </div>

        <Field label="Server URL" value={info.baseUrl} onCopy={() => copy("url", info.baseUrl)} copied={copied === "url"} />
        <Field label="Pairing Token" value={info.token} mono onCopy={() => copy("token", info.token)} copied={copied === "token"} secret />
        <Field label="Pairing URI (single copy-paste)" value={info.pairingUri} mono onCopy={() => copy("uri", info.pairingUri)} copied={copied === "uri"} />

        <div style={{ marginTop: 14, display: "flex", gap: 8, alignItems: "center" }}>
          <Button variant="outline" loading={rotateMutation.isPending} onClick={() => rotateMutation.mutate()}>
            <RefreshCw size={13} style={{ marginRight: 6 }} />
            Regenerate token
          </Button>
          {rotateMutation.data?.restartRequired && (
            <span style={{ fontSize: 11.5, color: "var(--color-warning)" }}>New token saved — restart the Desktop Agent for it to take effect.</span>
          )}
        </div>
      </Card>

      <Card style={{ padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>What the extension can do once paired</div>
        <ul style={{ fontSize: 12.5, color: "var(--color-text-muted)", lineHeight: 1.8, margin: 0, paddingLeft: 18 }}>
          <li>Save captured page data (URLs, headers, cookies, forms, endpoints, screenshots, etc.) directly into your current Project.</li>
          <li>Trigger Recon/Nuclei/HTTPX/Katana/Directory Scan jobs on this Desktop Agent from the right-click menu.</li>
          <li>Stream AI Side Panel responses (Explain Page, Analyze Forms, Suggest Payloads, etc.) using your configured AI provider.</li>
          <li>Create Findings and Notes, kept in sync with the desktop app's Project view.</li>
        </ul>
        <div style={{ fontSize: 11.5, color: "var(--color-text-muted)", marginTop: 10 }}>
          Captures flagged as potentially sensitive (cookies, tokens, storage contents) always require an explicit confirmation in the extension before anything is sent here — this Desktop Agent additionally refuses to save a sensitive capture that arrives without that confirmation flag set.
        </div>
      </Card>
    </div>
  );
}

function Field({ label, value, onCopy, copied, mono, secret }: { label: string; value: string; onCopy: () => void; copied: boolean; mono?: boolean; secret?: boolean }) {
  const [revealed, setRevealed] = useState(!secret);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <div
          style={{
            flex: 1,
            fontFamily: mono ? "var(--font-mono, monospace)" : undefined,
            fontSize: 12,
            padding: "6px 10px",
            borderRadius: "var(--radius-sm)",
            background: "var(--color-surface-2)",
            border: "1px solid var(--color-border)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {revealed ? value : "•".repeat(Math.min(value.length, 48))}
        </div>
        {secret && (
          <Button variant="ghost" onClick={() => setRevealed((r) => !r)}>
            {revealed ? "Hide" : "Show"}
          </Button>
        )}
        <Button variant="ghost" onClick={onCopy}>
          <Copy size={13} style={{ marginRight: 4 }} />
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
