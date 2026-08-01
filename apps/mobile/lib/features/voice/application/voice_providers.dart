import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/voice_service.dart';

final voiceServiceProvider = Provider<VoiceService>((ref) => VoiceService());

/// Push-to-Talk toggle button state — `false` (idle) / `true` (listening).
/// `toggleListening()` starts a [VoiceService.listenOnce] session and
/// returns the recognized text once the user stops talking (or null if
/// nothing was captured), for the caller (e.g. `AiChatScreen`) to send as a
/// chat message — Hands-Free Chat is this same flow triggered automatically
/// after each AI reply finishes speaking, rather than by a button tap (see
/// `voiceAutoListenProvider`).
final voiceListeningProvider = NotifierProvider<VoiceListeningNotifier, bool>(VoiceListeningNotifier.new);

class VoiceListeningNotifier extends Notifier<bool> {
  @override
  bool build() => false;

  Future<String?> toggleListening() async {
    final service = ref.read(voiceServiceProvider);
    if (state) {
      await service.stopListening();
      state = false;
      return null;
    }
    state = true;
    final result = await service.listenOnce();
    state = false;
    return result;
  }
}

/// Hands-Free Chat mode toggle (Settings > Voice) — when true, `AiChatScreen`
/// auto-starts listening again after each assistant reply is done speaking.
final handsFreeModeProvider = NotifierProvider<HandsFreeModeNotifier, bool>(HandsFreeModeNotifier.new);

class HandsFreeModeNotifier extends Notifier<bool> {
  @override
  bool build() => false;

  void toggle() => state = !state;
}

/// Read AI Responses (Settings > Voice) — when true, `AiChatScreen` calls
/// `VoiceService.speak` on every completed assistant message.
final readRepliesAloudProvider = NotifierProvider<ReadRepliesAloudNotifier, bool>(ReadRepliesAloudNotifier.new);

class ReadRepliesAloudNotifier extends Notifier<bool> {
  @override
  bool build() => false;

  void toggle() => state = !state;
}
