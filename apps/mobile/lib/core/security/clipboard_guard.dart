import 'dart:async';

import 'package:flutter/services.dart';

/// Clipboard Protection — clears anything this app itself wrote to the
/// system clipboard (a copied API key, a bearer token shown in Developer
/// Mode, an MFA backup code) after a short delay, so it doesn't linger
/// readable by every other app on the device indefinitely. Does not — and
/// cannot — intercept the OS's own copy affordances on arbitrary
/// `SelectableText`; call [copyAndAutoClear] explicitly at the few call
/// sites that copy genuinely sensitive values (MFA backup codes, API
/// tokens) instead of the default `Clipboard.setData`.
abstract final class ClipboardGuard {
  static Timer? _clearTimer;

  static Future<void> copyAndAutoClear(String value, {Duration after = const Duration(seconds: 45)}) async {
    await Clipboard.setData(ClipboardData(text: value));
    _clearTimer?.cancel();
    _clearTimer = Timer(after, () async {
      final current = await Clipboard.getData(Clipboard.kTextPlain);
      if (current?.text == value) {
        await Clipboard.setData(const ClipboardData(text: ''));
      }
    });
  }
}
