"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/// Renders one AI message's content as rich Markdown (Rich Markdown:
/// tables, task lists, fenced+highlighted code via the same
/// react-markdown/remark-gfm/rehype-highlight stack already used by the
/// Notes feature — see markdown-preview.tsx). Every code block gets a
/// minimal toolbar (Copy) — the full Smart Code Blocks spec (filename
/// detection, download, expand/collapse, wrap, fullscreen) is Phase 2;
/// this is the Phase 1 floor so code is at least immediately usable.
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

function CodeBlock({ children }: { children?: React.ReactNode }) {
  const preRef = React.useRef<HTMLPreElement>(null);
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    const text = preRef.current?.textContent ?? "";
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="group relative">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={handleCopy}
        className="absolute right-2 top-2 size-7 opacity-0 transition-opacity group-hover:opacity-100"
        aria-label="Copy code"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </Button>
      <pre ref={preRef}>{children}</pre>
    </div>
  );
}
