import 'dart:async';

import 'package:flutter_tts/flutter_tts.dart';
import 'package:speech_to_text/speech_to_text.dart' as stt;

/// Voice — Speech-to-Text / Text-to-Speech / Read AI Responses / Read
/// Reports / Hands-Free Chat / Voice Commands / Push-to-Talk. Wraps
/// `speech_to_text` (on-device STT, no network round-trip — same "your own
/// device" trust model as ADR 0007's local-first stance) and `flutter_tts`
/// (on-device or platform TTS engine). The backend's own
/// `AI_SPEECH_ENDPOINTS.transcribe`/`.synthesize` (Module 11 Voice Copilot,
/// server-side Whisper/ElevenLabs-class providers) remain available for
/// higher-quality transcription when online — this on-device path is what
/// makes Hands-Free Chat and Push-to-Talk work with zero latency and fully
/// offline, at the cost of lower accuracy than the server providers.
class VoiceService {
  VoiceService() : _speech = stt.SpeechToText(), _tts = FlutterTts();

  final stt.SpeechToText _speech;
  final FlutterTts _tts;
  bool _speechInitialized = false;

  Future<bool> get isAvailable async {
    if (_speechInitialized) return true;
    _speechInitialized = await _speech.initialize();
    return _speechInitialized;
  }

  /// Push-to-Talk / Hands-Free Chat entry point — listens until silence or
  /// [stopListening] is called, returning the final recognized text (or
  /// null if nothing was recognized / permission was denied).
  Future<String?> listenOnce({Duration timeout = const Duration(seconds: 30)}) async {
    if (!await isAvailable) return null;

    final completer = Completer<String?>();
    String? partial;

    await _speech.listen(
      onResult: (r) {
        partial = r.recognizedWords;
        if (r.finalResult && !completer.isCompleted) {
          completer.complete(r.recognizedWords);
        }
      },
      listenFor: timeout,
      pauseFor: const Duration(seconds: 3),
    );

    return completer.future.timeout(timeout, onTimeout: () => partial);
  }

  Future<void> stopListening() => _speech.stop();

  bool get isListening => _speech.isListening;

  /// Read AI Responses / Read Reports.
  Future<void> speak(String text) async {
    await _tts.setSpeechRate(0.5);
    await _tts.speak(text);
  }

  Future<void> stopSpeaking() => _tts.stop();
}
