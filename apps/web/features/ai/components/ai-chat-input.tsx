"use client";

import * as React from "react";
import { Mic, MicOff, Send, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useSpeechToText } from "../hooks/use-ai-voice";

/// AiChatInput. Voice Interaction (Phase 2): a mic button using the Web
/// Speech API (useSpeechToText) appends recognized speech into the
/// textarea rather than auto-sending, so the user can review/edit before
/// submitting — hidden entirely on browsers without SpeechRecognition
/// support (Firefox, most notably) rather than showing a broken button.
export function AiChatInput({
  onSend,
  onCancel,
  disabled,
  streaming,
  terminalMode = false,
}: {
  onSend: (content: string) => void;
  onCancel: () => void;
  disabled: boolean;
  streaming: boolean;
  terminalMode?: boolean;
}) {
  const [value, setValue] = React.useState("");

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  };

  const speechToText = useSpeechToText((finalText) => {
    setValue((prev) => (prev ? `${prev} ${finalText}` : finalText));
  });

  return (
    <div className={cn("flex items-end gap-2 border-t p-3", terminalMode ? "border-lime-900 bg-black" : "bg-background")}>
      <div className="relative flex-1">
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={
            speechToText.listening
              ? speechToText.interimTranscript || "Listening..."
              : terminalMode
                ? "$ ask the copilot..."
                : "Ask about findings, recon data, CVEs, HTTP requests..."
          }
          rows={2}
          disabled={disabled}
          className={cn(
            "min-h-[44px] resize-none",
            terminalMode && "border-lime-900 bg-black font-mono text-lime-200 placeholder:text-lime-700",
          )}
        />
      </div>
      {speechToText.supported && (
        <Button
          type="button"
          variant={speechToText.listening ? "destructive" : "outline"}
          size="icon"
          onClick={() => (speechToText.listening ? speechToText.stop() : speechToText.start())}
          disabled={disabled}
          aria-label={speechToText.listening ? "Stop voice input" : "Start voice input"}
          className={cn(speechToText.listening && "animate-pulse")}
        >
          {speechToText.listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
        </Button>
      )}
      {streaming ? (
        <Button type="button" variant="destructive" size="icon" onClick={onCancel} aria-label="Stop generating">
          <Square className="size-4" />
        </Button>
      ) : (
        <Button type="button" size="icon" onClick={handleSend} disabled={disabled || !value.trim()} aria-label="Send">
          <Send className="size-4" />
        </Button>
      )}
    </div>
  );
}
