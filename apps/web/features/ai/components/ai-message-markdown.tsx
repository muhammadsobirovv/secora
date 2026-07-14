"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Check, ChevronDown, ChevronUp, Copy, Download, Maximize2, WrapText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { downloadTextFile } from "../lib/download-text-file";
import { MermaidDiagram } from "./mermaid-diagram";

/// Renders one AI message's content as rich Markdown (Rich Markdown:
/// tables, task lists, fenced+highlighted code via the same
/// react-markdown/remark-gfm/rehype-highlight stack already used by the
/// Notes feature — see markdown-preview.tsx). Code blocks get the full
/// Smart Code Block toolbar (Phase 2): language badge, one-click
/// Download, line-wrap toggle, expand/collapse for tall blocks, and a
/// Fullscreen view — plus Interactive Canvas (Phase 2): a ```mermaid
/// block renders as a live diagram instead of text (mermaid-diagram.tsx).
export function AiMessageMarkdown({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn("prose prose-sm max-w-none dark:prose-invert", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  javascript: "js",
  typescript: "ts",
  jsx: "jsx",
  tsx: "tsx",
  python: "py",
  bash: "sh",
  shell: "sh",
  sh: "sh",
  zsh: "sh",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  html: "html",
  css: "css",
  sql: "sql",
  go: "go",
  rust: "rs",
  ruby: "rb",
  php: "php",
  java: "java",
  c: "c",
  cpp: "cpp",
  csharp: "cs",
  powershell: "ps1",
  markdown: "md",
  xml: "xml",
};

const TALL_BLOCK_LINE_THRESHOLD = 18;

function getLanguage(children?: React.ReactNode): string | null {
  if (!React.isValidElement(children)) return null;
  const props = children.props as { className?: string };
  const match = /language-(\w+)/.exec(props.className ?? "");
  return match?.[1] ?? null;
}

function CodeBlock({ children }: { children?: React.ReactNode }) {
  const preRef = React.useRef<HTMLPreElement>(null);
  const [copied, setCopied] = React.useState(false);
  const [wrap, setWrap] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);
  const [fullscreen, setFullscreen] = React.useState(false);
  const [text, setText] = React.useState("");

  const language = getLanguage(children);

  React.useEffect(() => {
    setText(preRef.current?.textContent ?? "");
  }, [children]);

  const lineCount = React.useMemo(() => text.split("\n").length, [text]);
  const isTall = lineCount > TALL_BLOCK_LINE_THRESHOLD;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDownload = () => {
    const ext = language ? (LANGUAGE_EXTENSIONS[language] ?? "txt") : "txt";
    downloadTextFile(`snippet.${ext}`, text, "text/plain");
  };

  if (language === "mermaid") {
    return <MermaidDiagram code={text || (preRef.current?.textContent ?? "")} />;
  }

  return (
    <div className="group relative">
      <div className="flex items-center justify-between rounded-t-lg border border-b-0 bg-muted/50 px-3 py-1">
        <span className="font-mono text-[11px] text-muted-foreground">{language ?? "text"}</span>
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => setWrap((w) => !w)}
            className={cn("size-6", wrap && "text-primary")}
            aria-label="Toggle line wrap"
          >
            <WrapText className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={handleDownload}
            className="size-6"
            aria-label="Download snippet"
          >
            <Download className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => setFullscreen(true)}
            className="size-6"
            aria-label="View fullscreen"
          >
            <Maximize2 className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={handleCopy}
            className="size-6"
            aria-label="Copy code"
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </Button>
        </div>
      </div>
      <div className={cn("relative overflow-hidden rounded-b-lg", !expanded && isTall && "max-h-80")}>
        <pre
          ref={preRef}
          className={cn("!mt-0 !rounded-t-none", wrap && "whitespace-pre-wrap break-words")}
        >
          {children}
        </pre>
        {!expanded && isTall && (
          <div className="absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-muted to-transparent pb-1 pt-8">
            <Button type="button" size="sm" variant="secondary" onClick={() => setExpanded(true)} className="h-6 gap-1 text-xs">
              <ChevronDown className="size-3" />
              Show all {lineCount} lines
            </Button>
          </div>
        )}
      </div>
      {expanded && isTall && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setExpanded(false)}
          className="mt-1 h-6 gap-1 text-xs text-muted-foreground"
        >
          <ChevronUp className="size-3" />
          Collapse
        </Button>
      )}

      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-hidden p-0">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle className="font-mono text-sm">{language ?? "text"}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[75vh] overflow-auto p-4">
            <pre className={cn(wrap && "whitespace-pre-wrap break-words")}>{children}</pre>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
