import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle } from "lucide-react";
import { desktopApi } from "../../lib/tauri-client";
import { Card, Skeleton } from "../../components/ui";

export function ToolsSettingsPanel() {
  const toolsQuery = useQuery({ queryKey: ["tool-availability"], queryFn: desktopApi.toolAvailability });
  const entries = toolsQuery.data ? Object.entries(toolsQuery.data) : [];

  return (
    <Card style={{ padding: 4 }}>
      {toolsQuery.isLoading && <Skeleton height={200} />}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
        {entries.map(([name, available]) => (
          <div key={name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", fontSize: 13, borderBottom: "1px solid var(--color-border)" }}>
            {available ? <CheckCircle2 size={14} color="var(--color-success)" /> : <XCircle size={14} color="var(--color-text-muted)" />}
            <span>{name}</span>
            {!available && <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--color-text-muted)" }}>not on PATH</span>}
          </div>
        ))}
      </div>
    </Card>
  );
}
