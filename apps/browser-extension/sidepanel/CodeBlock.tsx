import { useState } from "react";
import { Copy, Download, Check } from "lucide-react";
import { Mermaid } from "./Mermaid";

interface CodeBlockProps {
  className?: string;
  children?: React.ReactNode;
}

// Renders a fenced code block from `react-markdown` — routes ```mermaid
// to the diagram renderer (the "Mermaid"/"Artifacts" requirement) and
// everything else to a syntax-highlighted (`rehype-highlight`, applied
// by the parent `Markdown` wrapper) block with copy/download actions
// (the "code highlighting" + smart code block requirement).
export function CodeBlock({ className, children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const language = /language-(\w+)/.exec(className ?? "")?.[1] ?? "text";
  const text = String(children ?? "").replace(/\n$/, "");

  if (language === "mermaid") return <Mermaid chart={text} />;

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const download = () => {
    const ext: Record<string, string> = { javascript: "js", typescript: "ts", python: "py", bash: "sh", json: "json", html: "html", css: "css" };
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `snippet.${ext[language] ?? "txt"}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ position: "relative", margin: "6px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--color-bg-subtle)", padding: "4px 8px", borderRadius: "6px 6px 0 0", fontSize: 10.5, color: "var(--color-text-muted)" }}>
        <span>{language}</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => void copy()} style={iconBtnStyle} title="Copy">
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
          <button onClick={download} style={iconBtnStyle} title="Download">
            <Download size={12} />
          </button>
        </div>
      </div>
      <pre style={{ margin: 0, padding: 10, borderRadius: "0 0 6px 6px", background: "var(--color-bg-subtle)", overflowX: "auto", fontSize: 11.5 }}>
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = { background: "transparent", border: "none", cursor: "pointer", color: "inherit", display: "flex", padding: 2 };
