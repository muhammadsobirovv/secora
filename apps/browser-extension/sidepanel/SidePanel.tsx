import { useEffect, useRef, useState } from "react";
import { Send, Mic, MicOff, Volume2, VolumeX, Sparkles, FileSearch, Code2, ListTree, ShieldAlert, Lock, Globe2, Bug, FileCode, FileOutput, ListChecks, Puzzle } from "lucide-react";
import { BridgeClient } from "../shared/bridge-client";
import { getSettings } from "../shared/storage";
import { send } from "../shared/messaging";
import { Button, Card, Textarea, Spinner, EmptyState } from "../shared/ui";
import { Markdown } from "./Markdown";
import { listen, speak, stopSpeaking, isSpeaking, isSpeechRecognitionSupported } from "../shared/voice";
import type { StreamEvent, ExtensionSettings } from "../shared/types";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

interface QuickAction {
  label: string;
  icon: typeof Sparkles;
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: "Explain Page", icon: FileSearch },
  { label: "Analyze Forms", icon: ListChecks },
  { label: "Analyze JavaScript", icon: Code2 },
  { label: "Find Interesting Endpoints", icon: ListTree },
  { label: "Analyze Security Headers", icon: ShieldAlert },
  { label: "Analyze CSP", icon: Lock },
  { label: "Analyze CORS", icon: Globe2 },
  { label: "Suggest Payloads", icon: Bug },
  { label: "Generate PoC", icon: FileCode },
  { label: "Generate Report Draft", icon: FileOutput },
  { label: "Summarize Findings", icon: Puzzle },
];

export function SidePanel() {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [composer, setComposer] = useState("");
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const listenHandleRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    void (async () => {
      const s = await getSettings();
      setSettings(s);
    })();
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Auto-run a pending action set by the right-click "Run AI Analysis"
  // menu item (see `background/context-menus.ts`).
  useEffect(() => {
    void (async () => {
      const stored = await chrome.storage.session.get("ph_pending_ai_action");
      const pending = stored.ph_pending_ai_action as { action: string } | undefined;
      if (pending) {
        await chrome.storage.session.remove("ph_pending_ai_action");
        void runAction(pending.action);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const runAction = async (action: string) => {
    if (!settings?.bridge || busy) return;
    setBusy(true);

    let context: string | undefined;
    let pageUrl: string | undefined;
    try {
      const result = await send<{ context?: string; pageUrl?: string }>({ kind: "gatherAiContext", action });
      context = result.context;
      pageUrl = result.pageUrl;
    } catch {
      /* proceed without page context — the model can still answer generically */
    }

    await streamResponse(action, context, pageUrl);
  };

  const sendComposer = async () => {
    if (!composer.trim() || busy || !settings?.bridge) return;
    const text = composer.trim();
    setComposer("");
    await streamResponse(text, undefined, undefined);
  };

  const streamResponse = async (action: string, context: string | undefined, pageUrl: string | undefined) => {
    if (!settings?.bridge) return;
    const userMsgId = crypto.randomUUID();
    const assistantMsgId = crypto.randomUUID();
    setMessages((prev) => [...prev, { id: userMsgId, role: "user", content: action }, { id: assistantMsgId, role: "assistant", content: "", streaming: true }]);
    setBusy(true);

    try {
      const client = await BridgeClient.create(settings.bridge);
      const { conversationId: newConversationId, events } = await client.streamAiAnalyze({
        conversationId,
        action,
        pageUrl,
        pageContext: context,
        provider: settings.aiProvider ?? undefined,
      });
      if (newConversationId && !conversationId) setConversationId(newConversationId);

      let full = "";
      for await (const event of events) {
        if (event.type === "Delta") {
          full += event.content;
          setMessages((prev) => prev.map((m) => (m.id === assistantMsgId ? { ...m, content: full } : m)));
        } else if (event.type === "Done") {
          full = event.fullContent || full;
          setMessages((prev) => prev.map((m) => (m.id === assistantMsgId ? { ...m, content: full, streaming: false } : m)));
          if (settings.voice.autoReadAiResponses) {
            setSpeaking(true);
            speak(stripMarkdown(full), { onEnd: () => setSpeaking(false) });
          }
        } else if (event.type === "Error") {
          setMessages((prev) => prev.map((m) => (m.id === assistantMsgId ? { ...m, content: `⚠️ ${event.message}`, streaming: false } : m)));
        }
      }
    } catch (e) {
      setMessages((prev) => prev.map((m) => (m.id === assistantMsgId ? { ...m, content: `⚠️ ${e instanceof Error ? e.message : "Request failed"}`, streaming: false } : m)));
    } finally {
      setBusy(false);
    }
  };

  const toggleListening = () => {
    if (listening) {
      listenHandleRef.current?.stop();
      setListening(false);
      return;
    }
    setListening(true);
    listenHandleRef.current = listen({
      continuous: false,
      onResult: (text, isFinal) => {
        setComposer(text);
        if (isFinal) {
          setListening(false);
          void sendComposer();
        }
      },
      onEnd: () => setListening(false),
      onError: () => setListening(false),
    });
  };

  const toggleSpeaking = () => {
    if (speaking || isSpeaking()) {
      stopSpeaking();
      setSpeaking(false);
    }
  };

  if (!settings) {
    return (
      <div style={{ padding: 40, display: "flex", justifyContent: "center" }}>
        <Spinner />
      </div>
    );
  }

  if (!settings.bridge) {
    return (
      <div style={{ padding: 20 }}>
        <EmptyState title="Not connected" description="Pair with your Desktop Agent in Settings to use the AI Side Panel." />
        <Button variant="primary" style={{ width: "100%" }} onClick={() => chrome.runtime.openOptionsPage()}>
          Open Settings
        </Button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--color-border)", display: "flex", alignItems: "center", gap: 8 }}>
        <Sparkles size={16} color="var(--color-primary)" />
        <div style={{ fontSize: 13, fontWeight: 700 }}>AI Assistant</div>
      </div>

      <div style={{ padding: 10, display: "flex", flexWrap: "wrap", gap: 6, borderBottom: "1px solid var(--color-border)" }}>
        {QUICK_ACTIONS.map((qa) => {
          const Icon = qa.icon;
          return (
            <Button key={qa.label} size="sm" variant="outline" disabled={busy} onClick={() => void runAction(qa.label)} style={{ fontSize: 10.5 }}>
              <Icon size={11} /> {qa.label}
            </Button>
          );
        })}
      </div>

      <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.length === 0 && <EmptyState title="Ask about this page" description="Pick a quick action above, or type a question below." />}
        {messages.map((m) => (
          <Card key={m.id} style={{ padding: 10, background: m.role === "user" ? "var(--color-bg-subtle)" : "var(--color-bg-elevated)" }}>
            <div style={{ fontSize: 10, color: "var(--color-text-muted)", marginBottom: 4, fontWeight: 600 }}>{m.role === "user" ? "You" : "Secora AI"}</div>
            {m.role === "assistant" ? <Markdown content={m.content || (m.streaming ? "…" : "")} /> : <div style={{ fontSize: 12.5 }}>{m.content}</div>}
          </Card>
        ))}
      </div>

      <div style={{ padding: 10, borderTop: "1px solid var(--color-border)", display: "flex", gap: 6, alignItems: "flex-end" }}>
        <Textarea
          value={composer}
          onChange={(e) => setComposer(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void sendComposer();
            }
          }}
          placeholder="Ask a question…"
          rows={2}
          style={{ flex: 1 }}
        />
        {settings.voice.enabled && isSpeechRecognitionSupported() && (
          <Button size="icon" variant={listening ? "primary" : "outline"} onClick={toggleListening} title="Voice input">
            {listening ? <MicOff size={14} /> : <Mic size={14} />}
          </Button>
        )}
        {settings.voice.enabled && (
          <Button size="icon" variant="outline" onClick={toggleSpeaking} title="Stop speaking">
            {speaking ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </Button>
        )}
        <Button variant="primary" size="icon" loading={busy} onClick={() => void sendComposer()} title="Send">
          <Send size={14} />
        </Button>
      </div>
    </div>
  );
}

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[#*_`>~-]/g, "")
    .slice(0, 600);
}
