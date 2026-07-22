import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { FolderKanban, Plus } from "lucide-react";
import { desktopApi } from "../../lib/tauri-client";
import { Badge, Button, Card, EmptyState, ErrorState, Input, Skeleton } from "../../components/ui";

export function ProjectsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: desktopApi.listProjects });

  const createMutation = useMutation({
    mutationFn: () => desktopApi.createProject(name.trim(), description.trim() || undefined),
    onSuccess: (project) => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      setCreating(false);
      setName("");
      setDescription("");
      navigate(`/projects/${project.id}`);
    },
  });

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Projects</h1>
        <Button variant="primary" onClick={() => setCreating((v) => !v)}>
          <Plus size={14} /> New Project
        </Button>
      </div>

      {creating && (
        <Card style={{ padding: 16, marginBottom: 20, display: "flex", flexDirection: "column", gap: 10 }}>
          <Input placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <Input placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
          {createMutation.isError && <ErrorState message={(createMutation.error as Error).message} />}
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="primary" loading={createMutation.isPending} disabled={!name.trim()} onClick={() => createMutation.mutate()}>
              Create
            </Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {projectsQuery.isLoading && (
        <div style={{ display: "grid", gap: 10 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={64} />
          ))}
        </div>
      )}

      {projectsQuery.isError && <ErrorState message={(projectsQuery.error as Error).message} onRetry={() => void projectsQuery.refetch()} />}

      {projectsQuery.data && projectsQuery.data.length === 0 && (
        <EmptyState
          icon={<FolderKanban size={28} />}
          title="No projects yet"
          description="Create a project to start running recon and scan tools locally."
          action={
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus size={14} /> New Project
            </Button>
          }
        />
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {projectsQuery.data?.map((project) => (
          <Card
            key={project.id}
            style={{ padding: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}
            onClick={() => navigate(`/projects/${project.id}`)}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{project.name}</div>
              {project.description && <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>{project.description}</div>}
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <Badge tone={project.status === "ACTIVE" ? "success" : "default"}>{project.status}</Badge>
              <Badge tone={project.syncStatus === "SYNCED" ? "info" : "default"}>{project.syncStatus}</Badge>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
