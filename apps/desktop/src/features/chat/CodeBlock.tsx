import { useState, type CSSProperties } from "react";
import { Check, ChevronDown, Copy, Download, Save } from "lucide-react";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { Mermaid } from "./Mermaid";

const EXTENSION_FOR: Record<string, string> = {
  txt: "txt",
  md: "md",
  json: "json",
};

/// Every fenced code block in an AI response gets this toolbar — Copy /
/// Save (writes to disk via the `fs` plugin's native save dialog) /
/// Download (browser-style blob download, useful when the user just wants
/// it in their Downloads folder without picking a path). Mermaid code
/// fences render as diagrams via `Mermaid.tsx` instead of raw text, same
/// "Canvas"/"Artifact Viewer" idea as the web app's Interactive Canvas
/// (M5 Phase 2) — one canonical code-fence-to-visual pipeline reused here.
export function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  if (language === "mermaid") {
    return <Mermaid chart={code} />;
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleSave = async () => {
    const ext = EXTENSION_FOR[language] ?? (language || "txt");
    const path = await saveDialog({ defaultPath: `snippet.${ext}`, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
    if (path) {
      await writeTextFile(path, code);
    }
  };

  const handleDownload = (ext: string) => {
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `snippet.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    setMenuOpen(false);
  };

  return (
    <div style={{ position: "relative", margin: "8px 0", borderRadius: "var(--radius-md)", overflow: "hidden", border: "1px solid var(--color-border)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", background: "var(--color-bg-subtle)", borderBottom: "1px solid var(--color-border)" }}>
        <span style={{ fontSize: 11, color: "var(--color-text-muted)", fontFamily: "monospace" }}>{language || "text"}</span>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={handleCopy} title="Copy" style={toolbarBtn}>
            {copied ? <Check size={13} color="var(--color-success)" /> : <Copy size={13} />}
          </button>
          <button onClick={handleSave} title="Save to file" style={toolbarBtn}>
            <Save size={13} />
          </button>
          <div style={{ position: "relative" }}>
            <button onClick={() => setMenuOpen((v) => !v)} title="Download" style={toolbarBtn}>
              <Download size={13} />
              <ChevronDown size={11} />
            </button>
            {menuOpen && (
              <div style={{ position: "absolute", right: 0, top: "100%", marginTop: 4, background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", boxShadow: "var(--shadow-md)", zIndex: 10, minWidth: 90 }}>
                {["txt", "md", "json"].map((ext) => (
                  <div
                    key={ext}
                    onClick={() => handleDownload(ext)}
                    style={{ padding: "6px 12px", fontSize: 12, cursor: "pointer" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg-subtle)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    .{ext}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <pre style={{ margin: 0, padding: 12, overflowX: "auto", fontSize: 12.5, lineHeight: 1.5 }}>
        <code className={`hljs language-${language}`}>{code}</code>
      </pre>
    </div>
  );
}

const toolbarBtn: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 2,
  border: "none",
  background: "transparent",
  cursor: "pointer",
  color: "var(--color-text-muted)",
  padding: 4,
  borderRadius: 4,
};
