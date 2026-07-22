// Voice Assistant — Web Speech API (`SpeechRecognition` for STT,
// `speechSynthesis` for TTS). Both require a DOM/window context, so this
// module only works when imported from the Side Panel, Popup, Options,
// or DevTools panel — never from the background service worker, which
// has no `window`/microphone access at all in MV3. Falls back to the
// Desktop Agent's own STT/TTS (Whisper/Piper, see
// `apps/desktop/src-tauri/src/voice/`) via the bridge only if the
// browser's Web Speech API is unavailable (e.g. some Linux Chromium
// builds ship without a speech recognition backend) — see
// `sidepanel/hooks/useVoice.ts` for that fallback wiring.

type SpeechRecognitionCtor = new () => SpeechRecognition;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getRecognitionCtor() !== null;
}

export function isSpeechSynthesisSupported(): boolean {
  return "speechSynthesis" in window;
}

export interface VoiceListenHandle {
  stop: () => void;
}

/**
 * Starts continuous or single-shot listening. `onResult` fires with
 * interim + final transcripts (`isFinal` distinguishes them) so the UI
 * can show live partial text the way the Desktop Agent's chat composer
 * does.
 */
export function listen(options: { continuous: boolean; onResult: (text: string, isFinal: boolean) => void; onEnd: () => void; onError: (message: string) => void }): VoiceListenHandle {
  const Ctor = getRecognitionCtor();
  if (!Ctor) {
    options.onError("Speech recognition is not supported in this browser.");
    return { stop: () => {} };
  }

  const recognition = new Ctor();
  recognition.continuous = options.continuous;
  recognition.interimResults = true;
  recognition.lang = navigator.language || "en-US";

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      options.onResult(result[0].transcript, result.isFinal);
    }
  };
  recognition.onerror = (event: SpeechRecognitionErrorEvent) => options.onError(event.error);
  recognition.onend = () => options.onEnd();

  recognition.start();
  return { stop: () => recognition.stop() };
}

export function speak(text: string, options?: { rate?: number; pitch?: number; voiceName?: string; onEnd?: () => void }): void {
  if (!isSpeechSynthesisSupported()) return;
  window.speechSynthesis.cancel(); // interrupt anything currently speaking — "Interrupt" from the spec
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = options?.rate ?? 1;
  utterance.pitch = options?.pitch ?? 1;
  if (options?.voiceName) {
    const voice = window.speechSynthesis.getVoices().find((v) => v.name === options.voiceName);
    if (voice) utterance.voice = voice;
  }
  if (options?.onEnd) utterance.onend = options.onEnd;
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();
}

export function isSpeaking(): boolean {
  return isSpeechSynthesisSupported() && window.speechSynthesis.speaking;
}
