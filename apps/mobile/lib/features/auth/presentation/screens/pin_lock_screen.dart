import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../application/auth_notifier.dart';
import '../../domain/auth_state.dart';

/// Shown when `AuthState` is `AuthLocked` — offers Face ID/Fingerprint
/// first (auto-prompted once on entry) with PIN as the always-available
/// fallback, matching how iOS/Android banking apps gate resume-from-
/// background.
class PinLockScreen extends ConsumerStatefulWidget {
  const PinLockScreen({super.key});

  @override
  ConsumerState<PinLockScreen> createState() => _PinLockScreenState();
}

class _PinLockScreenState extends ConsumerState<PinLockScreen> {
  final _pin = StringBuffer();
  String? _error;
  bool _biometricTried = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _tryBiometric());
  }

  Future<void> _tryBiometric() async {
    if (_biometricTried) return;
    _biometricTried = true;
    final enabled = await ref.read(deviceLockServiceProvider).isBiometricEnabled;
    if (!enabled) return;
    await ref.read(authNotifierProvider.notifier).unlockWithBiometrics();
  }

  Future<void> _digit(String d) async {
    if (_pin.length >= 6) return;
    setState(() {
      _pin.write(d);
      _error = null;
    });
    if (_pin.length == 4 || _pin.length == 6) {
      final before = _pin.toString();
      await ref.read(authNotifierProvider.notifier).unlockWithPin(before);
      // If still locked after the attempt, the PIN was wrong.
      if (mounted && ref.read(authNotifierProvider) is AuthLocked) {
        setState(() {
          _error = 'Incorrect PIN';
          _pin.clear();
        });
      }
    }
  }

  void _backspace() {
    if (_pin.isEmpty) return;
    setState(() => _pin.write(_pin.toString().substring(0, _pin.length - 1)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          children: [
            const Spacer(),
            const Icon(Icons.lock_outline, size: 40, color: AppColors.primary),
            const SizedBox(height: 16),
            const Text('Enter your PIN', style: TextStyle(color: AppColors.textPrimary, fontSize: 18)),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(6, (i) {
                final filled = i < _pin.length;
                return Container(
                  margin: const EdgeInsets.symmetric(horizontal: 6),
                  width: 14,
                  height: 14,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: filled ? AppColors.primary : AppColors.border,
                  ),
                );
              }),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: const TextStyle(color: AppColors.danger)),
            ],
            const Spacer(),
            _Keypad(onDigit: _digit, onBackspace: _backspace, onBiometric: _tryBiometric),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}

class _Keypad extends StatelessWidget {
  const _Keypad({required this.onDigit, required this.onBackspace, required this.onBiometric});
  final void Function(String) onDigit;
  final VoidCallback onBackspace;
  final VoidCallback onBiometric;

  @override
  Widget build(BuildContext context) {
    const rows = [
      ['1', '2', '3'],
      ['4', '5', '6'],
      ['7', '8', '9'],
      ['bio', '0', 'del'],
    ];
    return Column(
      children: rows
          .map(
            (row) => Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: row.map((key) {
                return Padding(
                  padding: const EdgeInsets.all(8),
                  child: SizedBox(
                    width: 64,
                    height: 64,
                    child: switch (key) {
                      'bio' => IconButton(
                          icon: const Icon(Icons.fingerprint, color: AppColors.textSecondary),
                          onPressed: onBiometric,
                        ),
                      'del' => IconButton(
                          icon: const Icon(Icons.backspace_outlined, color: AppColors.textSecondary),
                          onPressed: onBackspace,
                        ),
                      _ => OutlinedButton(
                          onPressed: () => onDigit(key),
                          style: OutlinedButton.styleFrom(shape: const CircleBorder()),
                          child: Text(key, style: const TextStyle(fontSize: 22)),
                        ),
                    },
                  ),
                );
              }).toList(),
            ),
          )
          .toList(),
    );
  }
}
