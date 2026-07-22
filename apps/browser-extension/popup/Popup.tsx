import { useEffect, useState, useCallback } from "react";
import { Globe, FileCode2, FileText, Cookie, Database, Camera, Code2, ListChecks, Link2, ShieldAlert, Settings, PanelRight, Wand2, Download } from "lucide-react";
import { send, sendRaw } from "../shared/messaging";
import { Button, Card, Select, Spinner, EmptyState, ErrorBanner, Badge } from "../shared/ui";
import { openSidePanel } from "../shared/platform";
import { toMarkdown, toJson, downloadText, exportAsPdfViaPrint, type ExportableCapture } from "../shared/export";
import type { CaptureType, ExtensionState, ProjectRecord, TargetRecord } from "../shared/types";

async function openSidePanelForActiveTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.windowId !== undefined) await openSidePanel(tab.windowId, tab.id);
}

interface CaptureAction {
  type: CaptureType;
  label: string;
  icon: typeof Globe;
}

const CAPTURE_ACTIONS: CaptureAction[] = [
  { type: "url", label: "URL", icon: Link2 },
  { type: "domain", label: "Domain", icon: Globe },
  { type: "subdomain", label: "Subdomain", icon: Globe },
  { type: "headers", label: "Headers", icon: ListChecks },
  { type: "cookies", label: "Cookies", icon: Cookie },
  { type: "local_storage", label: "Storage", icon: Database },
  { type: "screenshot", label: "Screenshot", icon: Camera },
  { type: "html", label: "HTML", icon: FileCode2 },
  { type: "javascript", label: "JavaScript", icon: Code2 },
  { type: "forms", label: "Forms", icon: FileText },
  { type: "api_endpoints", label: "Endpoints", icon: Link2 },
  { type: "security_headers", label: "Security Hdrs", icon: ShieldAlert },
];

export function Popup() {
  const [paired, setPaired] = useState<boolean | null>(null);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [targets, setTargets] = useState<TargetRecord[]>([]);
  const [state, setLocalState] = useState<ExtensionState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmType, setConfirmType] = useState<CaptureType | null>(null);
  const [confirmReason, setConfirmReason] = useState<string>("");
  const [toast, setToast] = useState<string | null>(null);
  const [bbPlatform, setBbPlatform] = useState<{ platform: string; url: string } | null>(null);
  const [importingScope, setImportingScope] = useState(false);

  const refresh = useCallback(async () => {
    const settings = await send<{ bridge: unknown }>({ kind: "getSettings" });
    setPaired(!!settings.bridge);
    const s = await send<ExtensionState>({ kind: "getState" });
    setLocalState(s);
    if (settings.bridge) {
      try {
        const p = await send<ProjectRecord[]>({ kind: "listProjects" });
        setProjects(p);
        if (s.currentProjectId) {
          const t = await send<TargetRecord[]>({ kind: "listTargets", projectId: s.currentProjectId });
          setTargets(t);
        }
      } catch {
        setPaired(false);
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
    void (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id === undefined) return;
      const key = `ph_detected_platform_${tab.id}`;
      const stored = await chrome.storage.session.get(key);
      if (stored[key]) setBbPlatform(stored[key] as { platform: string; url: string });
    })();
  }, [refresh]);

  const importScope = async () => {
    setImportingScope(true);
    try {
      const scope = await send({ kind: "extractProgramScope" });
      const result = await send<{ targetsCreated: number }>({ kind: "importProgramScope", scope: scope as never });
      setToast(`Imported ${result.targetsCreated} target(s) from ${bbPlatform?.platform}.`);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setImportingScope(false);
    }
  };

  const onSelectProject = async (projectId: string) => {
    await send({ kind: "setCurrentProject", projectId });
    await refresh();
  };

  const onSelectTarget = async (targetId: string) => {
    await send({ kind: "setCurrentTarget", targetId });
    await refresh();
  };

  const runCapture = async (type: CaptureType, confirmed = false) => {
    setBusy(type);
    setToast(null);
    const result = await sendRaw({ kind: "capture", payload: { projectId: "", captureType: type, pageUrl: "", confirmed } });
    setBusy(null);
    if (result.ok) {
      setToast(`Saved ${type.replace(/_/g, " ")}`);
      void refresh();
      return;
    }
    if (result.error?.startsWith("CONFIRMATION_REQUIRED")) {
      setConfirmType(type);
      setConfirmReason(result.error.replace("CONFIRMATION_REQUIRED: ", ""));
      return;
    }
    setToast(result.error ?? "Capture failed");
  };

  const exportRecent = (format: "md" | "json" | "pdf") => {
    if (!state) return;
    const captures: ExportableCapture[] = state.recentCaptures.map((c) => ({ id: c.id, type: c.type, pageUrl: c.pageUrl, savedAs: c.savedAs, at: c.at }));
    if (format === "md") downloadText("pentesthub-captures.md", toMarkdown(captures), "text/markdown");
    else if (format === "json") downloadText("pentesthub-captures.json", toJson(captures), "application/json");
    else exportAsPdfViaPrint(captures);
  };

  if (paired === null) {
    return (
      <div style={{ padding: 24, display: "flex", justifyContent: "center" }}>
        <Spinner />
      </div>
    );
  }

  if (!paired) {
    return (
      <div style={{ padding: 16 }}>
        <EmptyState title="Not connected" description="Pair with your PentestHub AI Desktop Agent to start capturing." />
        <Button variant="primary" style={{ width: "100%" }} onClick={() => chrome.runtime.openOptionsPage()}>
          <Settings size={13} /> Open Settings to Pair
        </Button>
      </div>
    );
  }

  return (
    <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>PentestHub AI</div>
        <div style={{ display: "flex", gap: 4 }}>
          <Button size="icon" variant="ghost" title="Side Panel" onClick={() => void openSidePanelForActiveTab()}>
            <PanelRight size={14} />
          </Button>
          <Button size="icon" variant="ghost" title="Settings" onClick={() => chrome.runtime.openOptionsPage()}>
            <Settings size={14} />
          </Button>
        </div>
      </div>

      <Card style={{ padding: 10 }}>
        <div style={{ fontSize: 10.5, color: "var(--color-text-muted)", marginBottom: 3 }}>Project</div>
        {projects.length === 0 ? (
          <div style={{ fontSize: 12 }}>No projects yet — create one in the Desktop Agent.</div>
        ) : (
          <Select value={state?.currentProjectId ?? ""} onChange={onSelectProject} options={[{ value: "", label: "Select a project…" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]} />
        )}
        {state?.currentProjectId && (
          <>
            <div style={{ fontSize: 10.5, color: "var(--color-text-muted)", margin: "8px 0 3px" }}>Target</div>
            <Select
              value={state?.currentTargetId ?? ""}
              onChange={onSelectTarget}
              options={[{ value: "", label: "No target (project-level)" }, ...targets.map((t) => ({ value: t.id, label: `${t.type}: ${t.value}` }))]}
            />
          </>
        )}
      </Card>

      {bbPlatform && state?.currentProjectId && (
        <Card style={{ padding: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontSize: 11.5 }}>
            <Badge tone="info">{bbPlatform.platform}</Badge> program page detected
          </div>
          <Button size="sm" variant="primary" loading={importingScope} onClick={() => void importScope()}>
            Import scope
          </Button>
        </Card>
      )}

      {!state?.currentProjectId ? (
        <ErrorBanner message="Select a project above to start capturing." />
      ) : (
        <>
          <div style={{ fontSize: 10.5, color: "var(--color-text-muted)", fontWeight: 600 }}>QUICK CAPTURE</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {CAPTURE_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <Button key={action.type} variant="outline" loading={busy === action.type} onClick={() => runCapture(action.type)} style={{ flexDirection: "column", gap: 4, padding: "10px 4px", fontSize: 10.5 }}>
                  <Icon size={15} />
                  {action.label}
                </Button>
              );
            })}
          </div>

          <Button variant="primary" style={{ width: "100%" }} onClick={() => void openSidePanelForActiveTab()}>
            <Wand2 size={13} /> Ask AI about this page
          </Button>
        </>
      )}

      {toast && (
        <div style={{ fontSize: 11.5, textAlign: "center", color: "var(--color-text-muted)" }}>{toast}</div>
      )}

      {state && state.recentCaptures.length > 0 && (
        <Card style={{ padding: 10 }}>
          <div style={{ fontSize: 10.5, color: "var(--color-text-muted)", fontWeight: 600, marginBottom: 6 }}>RECENT</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {state.recentCaptures.slice(0, 5).map((c) => (
              <div key={c.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 210 }}>{c.type.replace(/_/g, " ")} — {new URL(c.pageUrl).hostname}</span>
                <Badge tone="success">{c.savedAs}</Badge>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <Button size="sm" variant="ghost" onClick={() => exportRecent("md")}>
              <Download size={11} /> MD
            </Button>
            <Button size="sm" variant="ghost" onClick={() => exportRecent("json")}>
              <Download size={11} /> JSON
            </Button>
            <Button size="sm" variant="ghost" onClick={() => exportRecent("pdf")}>
              <Download size={11} /> PDF
            </Button>
          </div>
        </Card>
      )}

      {confirmType && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <Card style={{ padding: 16, maxWidth: 300 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Confirm sensitive capture</div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 12 }}>{confirmReason}</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button variant="ghost" onClick={() => setConfirmType(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  const t = confirmType;
                  setConfirmType(null);
                  void runCapture(t, true);
                }}
              >
                Save anyway
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
