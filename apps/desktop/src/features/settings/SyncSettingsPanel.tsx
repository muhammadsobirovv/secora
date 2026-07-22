import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { desktopApi, type SyncMode } from "../../lib/tauri-client";
import { Badge, Button, Card, ErrorState, Input } from "../../components/ui";

const MODES: { value: SyncMode; label: string; description: string }[] = [
  { value: "OFF", label: "Off", description: "No network calls at all. Fully offline." },
  { value: "METADATA_ONLY", label: "Metadata only", description: "Sync Projects/Targets/Notes/Payloads." },
  { value: "EVERYTHING", label: "Everything", description: "Also sync findings, evidence metadata, reports, and AI chat history." },
];

export function SyncSettingsPanel() {
  const queryClient = useQueryClient();
  const configQuery = useQuery({ queryKey: ["sync-config"], queryFn: desktopApi.getSyncConfig });
  const retryQueueQuery = useQuery({ queryKey: ["sync-retry-queue"], queryFn: desktopApi.listSyncRetryQueue });
  const conflictsQuery = useQuery({ queryKey: ["sync-conflicts"], queryFn: desktopApi.listSyncConflicts });

  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [token, setToken] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");

  const setModeMutation = useMutation({
    mutationFn: (mode: SyncMode) => desktopApi.setSyncMode(mode),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["sync-config"] }),
  });

  const connectMutation = useMutation({
    mutationFn: () => desktopApi.setSyncConnection(apiBaseUrl.trim(), token.trim()),
    onSuccess: () => {
      setToken("");
      void queryClient.invalidateQueries({ queryKey: ["sync-config"] });
    },
  });

  const workspaceMutation = useMutation({
    mutationFn: () => desktopApi.setSyncWorkspace(workspaceId.trim()),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["sync-config"] }),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => desktopApi.disconnectSync(),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["sync-config"] }),
  });

  const syncNowMutation = useMutation({
    mutationFn: () => desktopApi.syncNow(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sync-config"] });
      void queryClient.invalidateQueries({ queryKey: ["sync-retry-queue"] });
      void queryClient.invalidateQueries({ queryKey: ["sync-conflicts"] });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: ({ entityType, id, keepLocal }: { entityType: string; id: string; keepLocal: boolean }) =>
      desktopApi.resolveSyncConflict(entityType, id, keepLocal),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["sync-conflicts"] }),
  });

  const config = configQuery.data;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card style={{ padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Sync mode</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {MODES.map((m) => (
            <label key={m.value} style={{ display: "flex", gap: 10, padding: 10, borderRadius: "var(--radius-sm)", border: config?.mode === m.value ? "1px solid var(--color-primary)" : "1px solid var(--color-border)", cursor: "pointer" }}>
              <input type="radio" checked={config?.mode === m.value} onChange={() => setModeMutation.mutate(m.value)} style={{ marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{m.label}</div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{m.description}</div>
              </div>
            </label>
          ))}
        </div>
      </Card>

      <Card style={{ padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Connection</div>
        {config?.apiBaseUrl ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 13 }}>
              Connected to <code>{config.apiBaseUrl}</code>
            </div>
            <Button size="sm" variant="danger" onClick={() => disconnectMutation.mutate()}>
              Disconnect
            </Button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Input placeholder="https://your-pentesthub-instance.com/api" value={apiBaseUrl} onChange={(e) => setApiBaseUrl(e.target.value)} />
            <Input type="password" placeholder="Access token" value={token} onChange={(e) => setToken(e.target.value)} />
            {connectMutation.isError && <ErrorState message={(connectMutation.error as Error).message} />}
            <div>
              <Button variant="primary" loading={connectMutation.isPending} disabled={!apiBaseUrl.trim() || !token.trim()} onClick={() => connectMutation.mutate()}>
                Connect
              </Button>
            </div>
          </div>
        )}

        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--color-border)" }}>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 6 }}>Workspace: {config?.workspaceId ?? "none selected"}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <Input placeholder="Workspace ID" value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} />
            <Button size="sm" variant="outline" disabled={!workspaceId.trim()} onClick={() => workspaceMutation.mutate()}>
              Set
            </Button>
          </div>
        </div>
      </Card>

      <Card style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Manual sync</div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Last synced: {config?.lastSyncedAt ?? "never"}</div>
          </div>
          <Button variant="outline" loading={syncNowMutation.isPending} onClick={() => syncNowMutation.mutate()}>
            <RefreshCw size={13} /> Sync Now
          </Button>
        </div>
        {syncNowMutation.data && (
          <div style={{ marginTop: 10, fontSize: 12, color: "var(--color-text-muted)" }}>
            Pushed {syncNowMutation.data.pushed}, pulled {syncNowMutation.data.pulled}, conflicts {syncNowMutation.data.conflicts}.
            {syncNowMutation.data.errors.length > 0 && <div style={{ color: "var(--color-danger)", marginTop: 4 }}>{syncNowMutation.data.errors.join("; ")}</div>}
          </div>
        )}
      </Card>

      {(retryQueueQuery.data?.length ?? 0) > 0 && (
        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Retry queue ({retryQueueQuery.data?.length})</div>
          {retryQueueQuery.data?.map((entry) => (
            <div key={`${entry.entityType}-${entry.entityId}`} style={{ fontSize: 12, padding: "6px 0", borderBottom: "1px solid var(--color-border)" }}>
              <Badge tone="warning">{entry.entityType}</Badge> attempt {entry.attempt} — {entry.lastError}
            </div>
          ))}
        </Card>
      )}

      {(conflictsQuery.data?.length ?? 0) > 0 && (
        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Conflicts ({conflictsQuery.data?.length})</div>
          {conflictsQuery.data?.map((conflict) => (
            <div key={`${conflict.entityType}-${conflict.id}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--color-border)" }}>
              <span style={{ fontSize: 12 }}>
                <Badge tone="danger">{conflict.entityType}</Badge> {conflict.id}
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <Button size="sm" variant="outline" onClick={() => resolveMutation.mutate({ entityType: conflict.entityType, id: conflict.id, keepLocal: true })}>
                  Keep mine
                </Button>
                <Button size="sm" variant="outline" onClick={() => resolveMutation.mutate({ entityType: conflict.entityType, id: conflict.id, keepLocal: false })}>
                  Take theirs
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
