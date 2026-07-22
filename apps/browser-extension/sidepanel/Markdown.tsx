import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { CodeBlock } from "./CodeBlock";

export function Markdown({ content }: { content: string }) {
  return (
    <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          code(props) {
            const { className, children, ...rest } = props;
            const isBlock = /language-/.test(className ?? "");
            if (!isBlock) {
              return (
                <code style={{ background: "var(--color-bg-subtle)", padding: "1px 4px", borderRadius: 4, fontSize: 11.5 }} {...rest}>
                  {children}
                </code>
              );
            }
            return <CodeBlock className={className}>{children}</CodeBlock>;
          },
          pre({ children }) {
            return <>{children}</>; // CodeBlock owns its own <pre>, avoid double-wrapping
          },
          a({ href, children }) {
            return (
              <a href={href} target="_blank" rel="noreferrer" style={{ color: "var(--color-primary)" }}>
                {children}
              </a>
            );
          },
          table({ children }) {
            return (
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 11.5 }}>{children}</table>
              </div>
            );
          },
          th({ children }) {
            return <th style={{ border: "1px solid var(--color-border)", padding: "4px 6px", textAlign: "left", background: "var(--color-bg-subtle)" }}>{children}</th>;
          },
          td({ children }) {
            return <td style={{ border: "1px solid var(--color-border)", padding: "4px 6px" }}>{children}</td>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
