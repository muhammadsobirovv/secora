import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { FolderKanban, LayoutDashboard, MessageSquare, Search, Settings } from "lucide-react";

interface Command {
  id: string;
  label: string;
  group: string;
  icon: ReactNode;
  action: (navigate: ReturnType<typeof useNavigate>) => void;
  keywords?: string;
}

const COMMANDS: Command[] = [
  { id: "nav-dashboard", label: "Go to Dashboard", group: "Navigate", icon: <LayoutDashboard size={14} />, action: (nav) => nav("/") },
  { id: "nav-projects", label: "Go to Projects", group: "Navigate", icon: <FolderKanban size={14} />, action: (nav) => nav("/projects") },
  { id: "nav-chat", label: "Go to AI Chat", group: "Navigate", icon: <MessageSquare size={14} />, action: (nav) => nav("/chat"), keywords: "assistant ai" },
  { id: "nav-settings", label: "Go to Settings", group: "Navigate", icon: <Settings size={14} />, action: (nav) => nav("/settings") },
  { id: "settings-ai", label: "Settings → AI Providers", group: "Settings", icon: <Settings size={14} />, action: (nav) => nav("/settings/ai") },
  { id: "settings-voice", label: "Settings → Voice", group: "Settings", icon: <Settings size={14} />, action: (nav) => nav("/settings/voice") },
  { id: "settings-sync", label: "Settings → Sync", group: "Settings", icon: <Settings size={14} />, action: (nav) => nav("/settings/sync") },
  { id: "settings-appearance", label: "Settings → Appearance", group: "Settings", icon: <Settings size={14} />, action: (nav) => nav("/settings/appearance") },
  { id: "settings-plugins", label: "Settings → Plugins", group: "Settings", icon: <Settings size={14} />, action: (nav) => nav("/settings/plugins") },
];

/// Command Palette (Cmd/Ctrl+K) — the "UI Polish" task's keyboard-first
/// navigation surface. Deliberately a small hand-rolled implementation
/// (substring filter over a static command list) rather than pulling in
/// `cmdk`; the Desktop Agent's command surface is small enough that fuzzy
/// scoring libraries would be overkill.
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMMANDS;
    return COMMANDS.filter((c) => c.label.toLowerCase().includes(q) || c.keywords?.includes(q));
  }, [query]);

  if (!open) return null;

  const runCommand = (cmd: Command) => {
    cmd.action(navigate);
    setOpen(false);
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "12vh" }}
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="phai-fade-in"
        style={{ width: 560, maxWidth: "90vw", background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-md)", overflow: "hidden" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--color-border)" }}>
          <Search size={16} color="var(--color-text-muted)" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter" && filtered[activeIndex]) {
                runCommand(filtered[activeIndex]);
              }
            }}
            placeholder="Type a command or search…"
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 14, color: "var(--color-text)" }}
          />
        </div>
        <div style={{ maxHeight: 360, overflowY: "auto", padding: 6 }}>
          {filtered.length === 0 && <div style={{ padding: 16, color: "var(--color-text-muted)", fontSize: 13 }}>No matching commands.</div>}
          {filtered.map((cmd, i) => (
            <div
              key={cmd.id}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => runCommand(cmd)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 10px",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                background: i === activeIndex ? "var(--color-bg-subtle)" : "transparent",
                fontSize: 13,
              }}
            >
              {cmd.icon}
              <span>{cmd.label}</span>
              <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--color-text-muted)" }}>{cmd.group}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
