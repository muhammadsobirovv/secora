"use client";

import * as React from "react";

/// Voice Interaction (Module 5 Phase 2), Web Speech API adapter — the
/// only speech backend with a real client-side implementation today (the
/// backend SpeechProvider registry lists four cloud adapters — OpenAI,
/// Azure, Google, ElevenLabs — all unconfigured until keys are supplied,
/// same posture as the chat providers; see
/// apps/api/src/modules/ai/speech/). Both hooks below degrade to
/// `supported: false` on browsers without the relevant API (Firefox has
/// no SpeechRecognition as of this writing) rather than throwing, so
/// callers can simply hide the mic/speak buttons.

function getSpeechRecognitionCtor(): (new () => SpeechRecognition) | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

export interface UseSpeechToTextResult {
  supported: boolean;
  listening: boolean;
  interimTranscript: string;
  error: string | null;
  start: () => void;
  stop: () => void;
}

/// Push-to-talk style speech-to-text: `start()` begins listening,
/// `onFinalTranscript` fires once per recognized phrase (interim results
/// are exposed separately so the caller can show live "…" feedback
/// without committing it to the input yet).
export function useSpeechToText(onFinalTranscript: (text: string) => void): UseSpeechToTextResult {
  const [listening, setListening] = React.useState(false);
  const [interimTranscript, setInterimTranscript] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const recognitionRef = React.useRef<SpeechRecognition | null>(null);
  const onFinalTranscriptRef = React.useRef(onFinalTranscript);
  onFinalTranscriptRef.current = onFinalTranscript;

  const Ctor = React.useMemo(() => getSpeechRecognitionCtor(), []);
  const supported = Ctor !== null;

  const stop = React.useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const start = React.useCallback(() => {
    if (!Ctor) return;
    setError(null);
    setInterimTranscript("");

    const recognition = new Ctor();
    recognition.lang = typeof navigator !== "undefined" ? navigator.language : "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results.item(i);
        const transcript = result.item(0).transcript;
        if (result.isFinal) finalText += transcript;
        else interimText += transcript;
      }
      if (finalText) onFinalTranscriptRef.current(finalText.trim());
      setInterimTranscript(interimText);
    };
    recognition.onerror = (event) => {
      setError(event.error || "Speech recognition error");
      setListening(false);
    };
    recognition.onstart = () => setListening(true);
    recognition.onend = () => {
      setListening(false);
      setInterimTranscript("");
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [Ctor]);

  React.useEffect(() => stop, [stop]);

  return { supported, listening, interimTranscript, error, start, stop };
}

export interface UseTextToSpeechResult {
  supported: boolean;
  speakingMessageId: string | null;
  speak: (messageId: string, text: string) => void;
  stop: () => void;
}

/// Text-to-speech playback for assistant messages (Speak / Stop Speaking
/// message action). Tracks which message id is currently being read aloud
/// so `AiChatMessage` can toggle its own button between Speak/Stop.
export function useTextToSpeech(): UseTextToSpeechResult {
  const [speakingMessageId, setSpeakingMessageId] = React.useState<string | null>(null);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  const stop = React.useCallback(() => {
    if (supported) window.speechSynthesis.cancel();
    setSpeakingMessageId(null);
  }, [supported]);

  const speak = React.useCallback(
    (messageId: string, text: string) => {
      if (!supported) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onend = () => setSpeakingMessageId((current) => (current === messageId ? null : current));
      utterance.onerror = () => setSpeakingMessageId((current) => (current === messageId ? null : current));
      setSpeakingMessageId(messageId);
      window.speechSynthesis.speak(utterance);
    },
    [supported],
  );

  React.useEffect(() => stop, [stop]);

  return { supported, speakingMessageId, speak, stop };
}
