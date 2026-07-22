import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mic, MicOff, Send } from "lucide-react";
import { desktopApi } from "../../lib/tauri-client";
import { Button, Textarea } from "../../components/ui";

// Web Speech API's SpeechRecognition isn't in the standard TS DOM lib yet
// on every TS version this monorepo pins — declared narrowly here rather
// than pulling in a whole `@types/dom-speech-recognition` package for one
// interface.
interface SpeechRecognitionResultLike {
  transcript: string;
}
interface SpeechRecognitionEventLike extends Event {
  results: { [index: number]: { [index: number]: SpeechRecognitionResultLike; isFinal: boolean }; length: number };
}
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
}

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/// Message composer — push-to-talk / continuous-listening voice input via
/// the Web Speech API (default STT backend, see `voice/mod.rs`'s module
/// doc), provider switcher (no restart needed — `ProviderRegistry::resolve`
/// re-reads credentials on every call), and Enter-to-send/Shift+Enter for
/// newline.
export function Composer({ onSend, disabled }: { onSend: (content: string, provider?: string) => void; disabled?: boolean }) {
  const [value, setValue] = useState("");
  const [provider, setProvider] = useState<string | undefined>(undefined);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const providersQuery = useQuery({ queryKey: ["ai-providers"], queryFn: desktopApi.listAiProviders });
  const voiceQuery = useQuery({ queryKey: ["voice-settings"], queryFn: desktopApi.getVoiceSettings });

  const SpeechRecognitionCtor = getSpeechRecognition();

  useEffect(() => {
    return () => recognitionRef.current?.stop();
  }, []);

  const toggleListening = () => {
    if (!SpeechRecognitionCtor) return;
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = voiceQuery.data?.continuousListening ?? false;
    recognition.interimResults = true;
    recognition.lang = voiceQuery.data?.language ?? "en-US";
    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setValue(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.start();
    recognitionRef.current = recognition;
    setListening(true);
  };

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed, provider);
    setValue("");
  };

  return (
    <div style={{ borderTop: "1px solid var(--color-border)", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Ask about your recon findings, request a payload, draft a report section…"
          rows={2}
          style={{ flex: 1 }}
        />
        {SpeechRecognitionCtor && (
          <Button variant={listening ? "danger" : "outline"} size="icon" onClick={toggleListening} title={listening ? "Stop listening" : "Push to talk"}>
            {listening ? <MicOff size={15} /> : <Mic size={15} />}
          </Button>
        )}
        <Button variant="primary" size="icon" onClick={submit} disabled={!value.trim() || disabled}>
          <Send size={15} />
        </Button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Provider:</span>
        <select
          value={provider ?? ""}
          onChange={(e) => setProvider(e.target.value || undefined)}
          style={{ fontSize: 12, padding: "3px 6px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)" }}
        >
          <option value="">Auto (first configured)</option>
          {providersQuery.data?.filter((p) => p.configured).map((p) => (
            <option key={p.provider} value={p.provider}>
              {p.provider} {p.byok ? "(your key)" : ""}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
