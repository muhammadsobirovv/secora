import type { CSSProperties } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Bookmark, BookmarkCheck, Bot, User, Volume2 } from "lucide-react";
import { CodeBlock } from "./CodeBlock";
import type { MessageRecord } from "../../lib/tauri-client";
import { desktopApi } from "../../lib/tauri-client";
import { useBookmarksStore } from "./useBookmarks";

/// One chat message — Markdown (tables/task-lists/strikethrough via
/// `remark-gfm`), syntax-highlighted code fences and Mermaid diagrams via
/// `CodeBlock`, and a "read aloud" button (Voice Reading requirement)
/// that calls the Rust `synthesize_speech` command when the configured
/// TTS backend is Piper, or the Web Speech API directly when it's the
/// browser backend (checked at click time so this component doesn't need
/// to know the user's Voice Settings up front).
export function MessageBubble({ message }: { message: MessageRecord }) {
  const isUser = message.role === "USER";
  const isSystem = message.role === "SYSTEM";
  const isBookmarked = useBookmarksStore((s) => s.isBookmarked(message.id));
  const toggleBookmark = useBookmarksStore((s) => s.toggle);

  const readAloud = async () => {
    const settings = await desktopApi.getVoiceSettings();
    if (settings.ttsBackend === "PIPER") {
      const path = await desktopApi.synthesizeSpeech(message.content);
      const audio = new Audio(path.startsWith("http") ? path : `asset://localhost/${path}`);
      void audio.play();
    } else if ("speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(message.content);
      if (settings.webSpeechVoice) {
        const voice = window.speechSynthesis.getVoices().find((v) => v.name === settings.webSpeechVoice);
        if (voice) utterance.voice = voice;
      }
      if (settings.interruptOnNewMessage) window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    }
  };

  if (isSystem) {
    return <div style={{ fontSize: 11, color: "var(--color-text-muted)", textAlign: "center", padding: "4px 0" }}>{message.content}</div>;
  }

  return (
    <div className="phai-fade-in" style={{ display: "flex", gap: 10, padding: "10px 0", flexDirection: isUser ? "row-reverse" : "row" }}>
      <div
        style={{
          width: 26,
          height: 26,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          background: isUser ? "var(--color-primary)" : "var(--color-bg-subtle)",
          color: isUser ? "var(--color-primary-fg)" : "var(--color-text-muted)",
        }}
      >
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>
      <div
        style={{
          maxWidth: "78%",
          background: isUser ? "var(--color-primary)" : "var(--color-bg-subtle)",
          color: isUser ? "var(--color-primary-fg)" : "var(--color-text)",
          borderRadius: "var(--radius-lg)",
          padding: "10px 14px",
          fontSize: 13.5,
          lineHeight: 1.6,
          position: "relative",
        }}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
          components={{
            pre: ({ children }) => <>{children}</>,
            code: ({ className, children }) => {
              const match = /language-(\w+)/.exec(className ?? "");
              if (match) {
                return <CodeBlock language={match[1] ?? "text"} code={String(children).replace(/\n$/, "")} />;
              }
              return (
                <code style={{ background: "color-mix(in srgb, currentColor 10%, transparent)", padding: "1px 5px", borderRadius: 4, fontSize: "0.9em" }}>
                  {children}
                </code>
              );
            },
          }}
        >
          {message.content}
        </ReactMarkdown>

        {message.content && (
          <div style={{ position: "absolute", bottom: -18, left: isUser ? "auto" : 0, right: isUser ? 0 : "auto", display: "flex", gap: 6 }}>
            {!isUser && (
              <button onClick={readAloud} title="Read aloud" style={iconBtnStyle}>
                <Volume2 size={13} />
              </button>
            )}
            <button onClick={() => toggleBookmark(message.id)} title={isBookmarked ? "Remove bookmark" : "Bookmark this message"} style={iconBtnStyle}>
              {isBookmarked ? <BookmarkCheck size={13} color="var(--color-primary)" /> : <Bookmark size={13} />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const iconBtnStyle: CSSProperties = { border: "none", background: "transparent", cursor: "pointer", color: "var(--color-text-muted)", padding: 2 };
