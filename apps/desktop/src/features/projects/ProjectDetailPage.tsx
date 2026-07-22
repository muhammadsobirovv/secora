import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { FileText, FolderOpen, ListChecks, Play, Plus, StickyNote, Target as TargetIcon, Trash2 } from "lucide-react";
import { desktopApi, type ReportFormat } from "../../lib/tauri-client";
import { Badge, Button, Card, EmptyState, ErrorState, Input, Skeleton, Textarea } from "../../components/ui";

const RECON_TOOLS = ["SUBFINDER", "AMASS", "KATANA", "HTTPX", "NAABU", "DNSX", "GAU", "WAYBACKURLS"];
const SCAN_TOOLS = ["NUCLEI", "FFUF", "DIRSEARCH", "FEROXBUSTER", "NIKTO", "DALFOX", "SQLMAP", "XSSTRIKE"];
const TARGET_TYPES = ["DOMAIN", "SUBDOMAIN", "IP_ADDRESS", "CIDR", "URL"];
const REPORT_FORMATS: ReportFormat[] = ["MARKDOWN", "HTML", "PDF", "DOCX", "TXT", "JSON", "ZIP"];

const TABS = ["Targets", "Jobs", "Notes", "Evidence", "Reports"] as const;
type Tab = (typeof TABS)[number];

export function ProjectDetailPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>("Targets");

  const projectQuery = useQuery({ queryKey: ["projects"], queryFn: desktopApi.listProjects });
  const project = projectQuery.data?.find((p) => p.id === projectId);

  if (!projectId) return null;

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20, margin: "0 0 4px" }}>{project?.name ?? <Skeleton width={200} height={22} />}</h1>
      {project?.description && <p style={{ color: "var(--color-text-muted)", fontSize: 13, marginTop: 0 }}>{project.description}</p>}

      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--color-border)", marginBottom: 20 }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "8px 14px",
              border: "none",
              borderBottom: tab === t ? "2px solid var(--color-primary)" : "2px solid transparent",
              background: "transparent",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 500,
              color: tab === t ? "var(--color-primary)" : "var(--color-text-muted)",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Targets" && <TargetsTab projectId={projectId} />}
      {tab === "Jobs" && <JobsTab projectId={projectId} />}
      {tab === "Notes" && <NotesTab projectId={projectId} />}
      {tab === "Evidence" && <EvidenceTab projectId={projectId} />}
      {tab === "Reports" && <ReportsTab projectId={projectId} />}
    </div>
  );
}

function TargetsTab({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");
  const [type, setType] = useState(TARGET_TYPES[0]);
  const [runFor, setRunFor] = useState<string | null>(null);

  const targetsQuery = useQuery({ queryKey: ["targets", projectId], queryFn: () => desktopApi.listTargets(projectId) });

  const createTarget = useMutation({
    mutationFn: () => desktopApi.createTarget(projectId, type, value.trim()),
    onSuccess: () => {
      setValue("");
      void queryClient.invalidateQueries({ queryKey: ["targets", projectId] });
    },
  });

  const runJob = useMutation({
    mutationFn: (input: { targetId: string; tool: string; kind: "RECON" | "SCAN" }) =>
      desktopApi.runToolJob({ kind: input.kind, tool: input.tool, targetId: input.targetId, projectId }),
    onSuccess: () => {
      setRunFor(null);
      void queryClient.invalidateQueries({ queryKey: ["jobs", projectId] });
    },
  });

  return (
    <div>
      <Card style={{ padding: 14, marginBottom: 16, display: "flex", gap: 8 }}>
        <select value={type} onChange={(e) => setType(e.target.value)} style={{ borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)", fontSize: 13, padding: "0 8px" }}>
          {TARGET_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <Input placeholder="e.g. example.com" value={value} onChange={(e) => setValue(e.target.value)} />
        <Button variant="primary" disabled={!value.trim()} loading={createTarget.isPending} onClick={() => createTarget.mutate()}>
          <Plus size={14} /> Add Target
        </Button>
      </Card>

      {targetsQuery.isLoading && <Skeleton height={80} />}
      {targetsQuery.data?.length === 0 && <EmptyState icon={<TargetIcon size={26} />} title="No targets" description="Add a domain, IP, CIDR, or URL to start recon/scanning." />}

      <div style={{ display: "grid", gap: 8 }}>
        {targetsQuery.data?.map((target) => (
          <Card key={target.id} style={{ padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <span style={{ fontFamily: "monospace", fontSize: 13 }}>{target.value}</span>{" "}
                <Badge>{target.type}</Badge>
              </div>
              <Button size="sm" variant="outline" onClick={() => setRunFor(runFor === target.id ? null : target.id)}>
                <Play size={12} /> Run Tool
              </Button>
            </div>
            {runFor === target.id && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--color-border)", display: "flex", flexWrap: "wrap", gap: 6 }}>
                {[...RECON_TOOLS.map((t) => ({ t, kind: "RECON" as const })), ...SCAN_TOOLS.map((t) => ({ t, kind: "SCAN" as const }))].map(({ t, kind }) => (
                  <Button
                    key={t}
                    size="sm"
                    variant="outline"
                    loading={runJob.isPending}
                    onClick={() => runJob.mutate({ targetId: target.id, tool: t, kind })}
                  >
                    {t}
                  </Button>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

function JobsTab({ projectId }: { projectId: string }) {
  const jobsQuery = useQuery({ queryKey: ["jobs", projectId], queryFn: () => desktopApi.listJobs(projectId), refetchInterval: 3000 });
  const queryClient = useQueryClient();

  const statusTone = (status: string) => (status === "COMPLETED" ? "success" : status === "FAILED" ? "danger" : status === "RUNNING" ? "info" : "default");

  const cancel = useMutation({
    mutationFn: (id: string) => desktopApi.cancelJob(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["jobs", projectId] }),
  });

  if (jobsQuery.isLoading) return <Skeleton height={120} />;
  if (!jobsQuery.data?.length) return <EmptyState icon={<ListChecks size={26} />} title="No jobs yet" description="Run a recon or scan tool from the Targets tab." />;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {jobsQuery.data.map((job) => (
        <Card key={job.id} style={{ padding: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{job.tool}</span>{" "}
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>({job.kind})</span>
            {job.errorMessage && <div style={{ fontSize: 12, color: "var(--color-danger)", marginTop: 4 }}>{job.errorMessage}</div>}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <Badge tone={statusTone(job.status)}>{job.status}</Badge>
            {(job.status === "RUNNING" || job.status === "QUEUED") && (
              <Button size="sm" variant="outline" onClick={() => cancel.mutate(job.id)}>
                Cancel
              </Button>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

function NotesTab({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const notesQuery = useQuery({ queryKey: ["notes", projectId], queryFn: () => desktopApi.listNotes(projectId) });
  const createNote = useMutation({
    mutationFn: () => desktopApi.createNote(projectId, content.trim(), title.trim() || undefined),
    onSuccess: () => {
      setTitle("");
      setContent("");
      void queryClient.invalidateQueries({ queryKey: ["notes", projectId] });
    },
  });
  const deleteNote = useMutation({
    mutationFn: (id: string) => desktopApi.deleteNote(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["notes", projectId] }),
  });

  return (
    <div>
      <Card style={{ padding: 14, marginBottom: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        <Input placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Textarea placeholder="Write a note… (Markdown supported)" rows={4} value={content} onChange={(e) => setContent(e.target.value)} />
        <div>
          <Button variant="primary" disabled={!content.trim()} loading={createNote.isPending} onClick={() => createNote.mutate()}>
            <Plus size={14} /> Add Note
          </Button>
        </div>
      </Card>

      {notesQuery.data?.length === 0 && <EmptyState icon={<StickyNote size={26} />} title="No notes yet" />}
      <div style={{ display: "grid", gap: 8 }}>
        {notesQuery.data?.map((note) => (
          <Card key={note.id} style={{ padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              {note.title && <div style={{ fontWeight: 600, fontSize: 13 }}>{note.title}</div>}
              <button onClick={() => deleteNote.mutate(note.id)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-text-muted)" }}>
                <Trash2 size={13} />
              </button>
            </div>
            <div style={{ fontSize: 13, whiteSpace: "pre-wrap", marginTop: 4 }}>{note.content}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function EvidenceTab({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [dragOver, setDragOver] = useState(false);

  const evidenceQuery = useQuery({ queryKey: ["evidence", projectId], queryFn: () => desktopApi.listEvidence(projectId) });

  const importMutation = useMutation({
    mutationFn: (path: string) => desktopApi.importEvidence(projectId, path, []),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["evidence", projectId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => desktopApi.deleteEvidence(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["evidence", projectId] }),
  });

  // Tauri's webview emits a native OS file-drop event carrying absolute
  // paths on `e.dataTransfer.files` isn't populated the way browser drops
  // are (no path exposed for security in plain browsers) — Tauri's
  // `tauri://file-drop` window event (subscribed in `useEffect` in a full
  // implementation) is the real source of dropped paths; this handler
  // covers the "already have a path, e.g. from Import button" flow, and
  // documents where full native drag-drop wiring plugs in.
  return (
    <div>
      <div
        className={dragOver ? "phai-dropzone-active" : undefined}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          // Real path resolution happens via the `tauri://file-drop` event
          // (see App.tsx's window-level listener); this onDrop only
          // handles the visual affordance in a plain browser preview.
        }}
        style={{ padding: 24, borderRadius: "var(--radius-md)", border: "1px dashed var(--color-border)", textAlign: "center", marginBottom: 16, color: "var(--color-text-muted)", fontSize: 13 }}
      >
        <FolderOpen size={22} style={{ marginBottom: 6 }} />
        <div>Drag files here, or use the Import button from a Notes/Chat attachment.</div>
      </div>

      {evidenceQuery.data?.length === 0 && <EmptyState icon={<FolderOpen size={26} />} title="No evidence yet" />}
      <div style={{ display: "grid", gap: 8 }}>
        {evidenceQuery.data?.map((item) => (
          <Card key={item.id} style={{ padding: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{item.fileName}</div>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                {item.mimeType ?? "unknown"} · {item.sizeBytes ? `${Math.round(item.sizeBytes / 1024)} KB` : "—"} · {item.sha256?.slice(0, 12)}
              </div>
            </div>
            <button onClick={() => deleteMutation.mutate(item.id)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-text-muted)" }}>
              <Trash2 size={13} />
            </button>
          </Card>
        ))}
      </div>
      {importMutation.isError && <ErrorState message={(importMutation.error as Error).message} />}
    </div>
  );
}

function ReportsTab({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const reportsQuery = useQuery({ queryKey: ["reports", projectId], queryFn: () => desktopApi.listReports(projectId) });

  const generate = useMutation({
    mutationFn: (format: ReportFormat) => desktopApi.generateReport(projectId, format),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["reports", projectId] }),
  });

  return (
    <div>
      <Card style={{ padding: 14, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Generate a report</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {REPORT_FORMATS.map((format) => (
            <Button key={format} variant="outline" size="sm" loading={generate.isPending} onClick={() => generate.mutate(format)}>
              <FileText size={13} /> {format}
            </Button>
          ))}
        </div>
        {generate.isError && <ErrorState message={(generate.error as Error).message} />}
      </Card>

      {reportsQuery.data?.length === 0 && <EmptyState icon={<FileText size={26} />} title="No reports generated yet" />}
      <div style={{ display: "grid", gap: 8 }}>
        {reportsQuery.data?.map((report) => (
          <Card key={report.id} style={{ padding: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{report.title}</div>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{report.filePath}</div>
            </div>
            <Badge>{report.format}</Badge>
          </Card>
        ))}
      </div>
    </div>
  );
}
