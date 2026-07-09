import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { cn } from "@/lib/utils";

export function MarkdownPreview({ content, className }: { content: string; className?: string }) {
  return (
    <div
      className={cn(
        "prose prose-sm max-w-none dark:prose-invert",
        "prose-headings:font-semibold prose-a:text-primary prose-code:before:content-none prose-code:after:content-none",
        "prose-pre:bg-muted prose-pre:text-foreground",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {content || "*Nothing to preview yet.*"}
      </ReactMarkdown>
    </div>
  );
}
