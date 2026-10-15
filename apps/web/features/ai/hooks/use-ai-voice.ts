"use client";

import * as React from "react";
import { toast } from "sonner";
import { synthesizeAiSpeech, transcribeAiSpeech } from "@/lib/api/ai";
import { useAiSpeechProviders } from "./use-ai";
import { blobToWav16k } from "../lib/encode-wav";

/// Voice Interaction. Two backends:
///   1. Azure Speech (server-side, via /ai/speech/*) when AI_SPEECH_AZURE_*
///      is configured — high-quality Uzbek, Russian and English voices.
///   2. Web Speech API (browser) as the fallback — works without any server
///      keys, but has no Uzbek voice on most devices.
/// Both hooks degrade to `supported: false` when neither backend is usable,
/// so callers can hide the mic/speaker buttons.

export const SPEECH_LANGUAGES = [
  { code: "uz-UZ", label: "O'zbekcha", voice: "uz-UZ-MadinaNeural" },
  { code: "ru-RU", label: "Русский", voice: "ru-RU-SvetlanaNeural" },
  { code: "en-US", label: "English", voice: "en-US-JennyNeural" },
] as const;

export type SpeechLanguageCode = (typeof SPEECH_LANGUAGES)[number]["code"];

const DEFAULT_SPEECH_LANGUAGE: SpeechLanguageCode = "uz-UZ";
const SPEECH_LANGUAGE_STORAGE_KEY = "ai-speech-language";
/// Azure's TTS request is capped at 4000 characters by the API DTO.
const MAX_SPEAKABLE_CHARS = 4000;

/// Strips markdown syntax so the voice doesn't read "*", "#", "`" or
/// bullet characters out loud.
function toSpeakableText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*[-*+•]\s+/gm, "")
    .replace(/[*_#>|~]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SPEAKABLE_CHARS);
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognition) | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

function canRecordAudio(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

/// The selected speech language, remembered per browser.
export function useSpeechLanguage(): [SpeechLanguageCode, (code: SpeechLanguageCode) => void] {
  const [language, setLanguageState] = React.useState<SpeechLanguageCode>(DEFAULT_SPEECH_LANGUAGE);

  React.useEffect(() => {
    const saved = window.localStorage.getItem(SPEECH_LANGUAGE_STORAGE_KEY);
    if (SPEECH_LANGUAGES.some((l) => l.code === saved)) setLanguageState(saved as SpeechLanguageCode);
  }, []);

  const setLanguage = React.useCallback((code: SpeechLanguageCode) => {
    setLanguageState(code);
    window.localStorage.setItem(SPEECH_LANGUAGE_STORAGE_KEY, code);
  }, []);

  return [language, setLanguage];
}

/// True when the server has Azure Speech configured (and the browser can
/// record audio for speech-to-text).
export function useAzureSpeechAvailable(): boolean {
  const { data } = useAiSpeechProviders();
  return data?.some((p) => p.provider === "AZURE_SPEECH" && p.configured) ?? false;
}

export interface UseSpeechToTextResult {
  supported: boolean;
  listening: boolean;
  busy: boolean;
  interimTranscript: string;
  error: string | null;
  start: () => void;
  stop: () => void;
}

/// Push-to-talk speech-to-text. `start()` begins listening; `stop()` ends it.
/// `onFinalTranscript` fires with the recognized text (once per phrase in
/// browser mode, once per recording in Azure mode).
export function useSpeechToText(
  onFinalTranscript: (text: string) => void,
  language: SpeechLanguageCode,
): UseSpeechToTextResult {
  const azureAvailable = useAzureSpeechAvailable();
  const useAzure = azureAvailable && canRecordAudio();

  const [listening, setListening] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [interimTranscript, setInterimTranscript] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const onFinalRef = React.useRef(onFinalTranscript);
  onFinalRef.current = onFinalTranscript;
  const languageRef = React.useRef(language);
  languageRef.current = language;

  const recognitionRef = React.useRef<SpeechRecognition | null>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);

  const RecognitionCtor = React.useMemo(() => getSpeechRecognitionCtor(), []);
  const supported = useAzure || RecognitionCtor !== null;

  // ── Azure mode: record, then transcribe on stop ─────────────────────────
  const stopAzure = React.useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, []);

  const startAzure = React.useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setListening(false);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        chunksRef.current = [];
        if (blob.size === 0) return;

        setBusy(true);
        try {
          const wav = await blobToWav16k(blob);
          const result = await transcribeAiSpeech(wav, languageRef.current);
          const text = result.text.trim();
          if (text) onFinalRef.current(text);
          else setError("No speech detected");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Transcription failed");
        } finally {
          setBusy(false);
        }
      };

      recorder.start();
      setListening(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Microphone unavailable");
      setListening(false);
    }
  }, []);

  // ── Browser mode: Web Speech API ────────────────────────────────────────
  const stopBrowser = React.useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const startBrowser = React.useCallback(() => {
    if (!RecognitionCtor) return;
    setError(null);
    setInterimTranscript("");

    const recognition = new RecognitionCtor();
    recognition.lang = languageRef.current;
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
      if (finalText) onFinalRef.current(finalText.trim());
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
  }, [RecognitionCtor]);

  const start = React.useCallback(() => {
    if (useAzure) void startAzure();
    else startBrowser();
  }, [useAzure, startAzure, startBrowser]);

  const stop = React.useCallback(() => {
    if (useAzure) stopAzure();
    else stopBrowser();
  }, [useAzure, stopAzure, stopBrowser]);

  React.useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return { supported, listening, busy, interimTranscript, error, start, stop };
}

export interface UseTextToSpeechResult {
  supported: boolean;
  speakingMessageId: string | null;
  speak: (messageId: string, text: string) => void;
  stop: () => void;
}

/// Text-to-speech playback for assistant messages (Speak / Stop Speaking
/// message action). Uses Azure neural voices when configured, else the
/// browser's speechSynthesis. Tracks which message is being read aloud so
/// `AiChatMessage` can toggle its own button between Speak/Stop.
export function useTextToSpeech(language: SpeechLanguageCode): UseTextToSpeechResult {
  const azureAvailable = useAzureSpeechAvailable();
  const browserSupported = typeof window !== "undefined" && "speechSynthesis" in window;
  const supported = azureAvailable || browserSupported;

  const [speakingMessageId, setSpeakingMessageId] = React.useState<string | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const requestRef = React.useRef(0);

  const stop = React.useCallback(() => {
    requestRef.current += 1; // invalidate any in-flight Azure request
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (browserSupported) window.speechSynthesis.cancel();
    setSpeakingMessageId(null);
  }, [browserSupported]);

  const speak = React.useCallback(
    (messageId: string, text: string) => {
      stop();
      const speakable = toSpeakableText(text);
      if (!speakable) return;
      const requestId = requestRef.current;
      setSpeakingMessageId(messageId);

      const speakInBrowser = () => {
      if (!browserSupported) {
        if (requestId === requestRef.current) setSpeakingMessageId(null);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(speakable);
      const prefix = language.slice(0, 2);
      const voices = window.speechSynthesis.getVoices();
      // Browser fallback: prefer an exact language voice; Uzbek falls back to
      // Russian, which reads Latin-script Uzbek far better than English does.
      const voice =
        voices.find((v) => v.lang.toLowerCase().startsWith(prefix)) ??
        (prefix === "uz" ? voices.find((v) => v.lang.toLowerCase().startsWith("ru")) : undefined);
      if (voice) utterance.voice = voice;
      utterance.lang = voice?.lang ?? language;
      const clearBrowserSpeaking = () => {
        if (requestId === requestRef.current) setSpeakingMessageId(null);
      };
      utterance.onend = clearBrowserSpeaking;
      utterance.onerror = clearBrowserSpeaking;
      window.speechSynthesis.speak(utterance);
      };

      if (azureAvailable) {
        const voice = SPEECH_LANGUAGES.find((l) => l.code === language)?.voice ?? SPEECH_LANGUAGES[0].voice;
        synthesizeAiSpeech(speakable, voice)
          .then((result) => {
            if (requestId !== requestRef.current) return;
            const audio = new Audio(`data:${result.mimeType};base64,${result.audioBase64}`);
            audioRef.current = audio;
            const clear = () => {
              if (requestId === requestRef.current) setSpeakingMessageId(null);
            };
            audio.onended = clear;
            audio.onerror = () => {
              toast.error("Ovozni ijro etib bo'lmadi.");
              clear();
            };
            return audio.play();
          })
          .catch((error: unknown) => {
            if (requestId !== requestRef.current) return;
            const message = error instanceof Error ? error.message : "Azure ovozi ishlamadi.";
            toast.error(`Azure ovozi xatosi: ${message}`);
            speakInBrowser();
          });
        return;
      }

      speakInBrowser();
    },
    [azureAvailable, browserSupported, language, stop],
  );

  React.useEffect(() => stop, [stop]);

  return { supported, speakingMessageId, speak, stop };
}
