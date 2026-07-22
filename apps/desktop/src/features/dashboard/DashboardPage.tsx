import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, FolderKanban, MessageSquare, Wrench, XCircle } from "lucide-react";
import { desktopApi } from "../../lib/tauri-client";
import { Badge, Button, Card, Skeleton } from "../../components/ui";

export function DashboardPage() {
  const navigate = useNavigate();
  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: desktopApi.listProjects });
  const toolsQuery = useQuery({ queryKey: ["tool-availability"], queryFn: desktopApi.toolAvailability });
  const providersQuery = useQuery({ queryKey: ["ai-providers"], queryFn: desktopApi.listAiProviders });

  const toolEntries = toolsQuery.data ? Object.entries(toolsQuery.data) : [];
  const installedCount = toolEntries.filter(([, ok]) => ok).length;
  const configuredProvider = providersQuery.data?.find((p) => p.configured);

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>Dashboard</h1>
      <p style={{ color: "var(--color-text-muted)", fontSize: 13, marginTop: 0 }}>Local execution engine — recon, scanning, AI, RAG, voice, and reporting, all on this machine.</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 20 }}>
        <Card style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--color-text-muted)", fontSize: 12 }}>
            <FolderKanban size={14} /> Projects
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6 }}>{projectsQuery.data?.length ?? <Skeleton width={40} height={26} />}</div>
          <Button size="sm" variant="ghost" style={{ marginTop: 8, padding: 0 }} onClick={() => navigate("/projects")}>
            View all →
          </Button>
        </Card>

        <Card style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--color-text-muted)", fontSize: 12 }}>
            <Wrench size={14} /> Tools installed
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6 }}>
            {toolsQuery.data ? `${installedCount} / ${toolEntries.length}` : <Skeleton width={60} height={26} />}
          </div>
        </Card>

        <Card style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--color-text-muted)", fontSize: 12 }}>
            <MessageSquare size={14} /> AI Provider
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, marginTop: 10 }}>
            {providersQuery.data ? configuredProvider?.provider ?? "None configured" : <Skeleton width={100} height={20} />}
          </div>
          <Button size="sm" variant="ghost" style={{ marginTop: 8, padding: 0 }} onClick={() => navigate("/settings/ai")}>
            Configure →
          </Button>
        </Card>
      </div>

      <h2 style={{ fontSize: 15, marginTop: 32, marginBottom: 10 }}>Tool availability</h2>
      <Card style={{ padding: 4 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
          {toolEntries.map(([name, available]) => (
            <div key={name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", fontSize: 13 }}>
              {available ? <CheckCircle2 size={14} color="var(--color-success)" /> : <XCircle size={14} color="var(--color-text-muted)" />}
              {name}
              {!available && <Badge>missing</Badge>}
            </div>
          ))}
          {toolsQuery.isLoading && <Skeleton height={80} />}
        </div>
      </Card>
    </div>
  );
}
