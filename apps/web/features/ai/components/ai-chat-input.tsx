"use client";

import * as React from "react";
import { Mic, MicOff, Send, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { SPEECH_LANGUAGES, useSpeechToText, type SpeechLanguageCode } from "../hooks/use-ai-voice";

/// AiChatInput. Voice Interaction: the mic button (Azure Speech when the
/// server has it configured, otherwise the browser Web Speech API) appends
/// recognized speech into the textarea rather than auto-sending, so the user
/// can review/edit before submitting. A language picker sets the recognition
/// language (Uzbek, Russian, English). The mic is hidden when no backend is
/// usable rather than showing a broken button.
export function AiChatInput({
  onSend,
  onCancel,
  disabled,
  streaming,
  terminalMode = false,
  speechLanguage,
  onSpeechLanguageChange,
}: {
  onSend: (content: string) => void;
  onCancel: () => void;
  disabled: boolean;
  streaming: boolean;
  terminalMode?: boolean;
  speechLanguage: SpeechLanguageCode;
  onSpeechLanguageChange: (code: SpeechLanguageCode) => void;
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
  }, speechLanguage);

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
            speechToText.busy
              ? "Transcribing..."
              : speechToText.listening
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
        <>
          <select
            value={speechLanguage}
            onChange={(e) => onSpeechLanguageChange(e.target.value as SpeechLanguageCode)}
            disabled={speechToText.listening || speechToText.busy}
            aria-label="Voice language"
            title="Voice language"
            className={cn(
              "h-9 rounded-md border bg-background px-2 text-xs",
              terminalMode && "border-lime-900 bg-black font-mono text-lime-400",
            )}
          >
            {SPEECH_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant={speechToText.listening ? "destructive" : "outline"}
            size="icon"
            onClick={() => (speechToText.listening ? speechToText.stop() : speechToText.start())}
            disabled={disabled || speechToText.busy}
            aria-label={speechToText.listening ? "Stop voice input" : "Start voice input"}
            className={cn(speechToText.listening && "animate-pulse")}
          >
            {speechToText.listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
          </Button>
        </>
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
