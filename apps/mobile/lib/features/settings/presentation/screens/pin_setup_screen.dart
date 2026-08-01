import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../auth/application/auth_notifier.dart';

/// Settings > Security > PIN lock setup — also toggles Biometric
/// Authentication (Face ID/Fingerprint) when the device supports it.
class PinSetupScreen extends ConsumerStatefulWidget {
  const PinSetupScreen({super.key});

  @override
  ConsumerState<PinSetupScreen> createState() => _PinSetupScreenState();
}

class _PinSetupScreenState extends ConsumerState<PinSetupScreen> {
  final _pinController = TextEditingController();
  final _confirmController = TextEditingController();
  bool _biometricSupported = false;
  bool _biometricEnabled = false;
  bool _hasPin = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final service = ref.read(deviceLockServiceProvider);
    final supported = await service.isBiometricSupported;
    final enabled = await service.isBiometricEnabled;
    final hasPin = await service.hasPin;
    setState(() {
      _biometricSupported = supported;
      _biometricEnabled = enabled;
      _hasPin = hasPin;
    });
  }

  Future<void> _savePin() async {
    if (_pinController.text.length < 4) {
      setState(() => _error = 'PIN must be at least 4 digits');
      return;
    }
    if (_pinController.text != _confirmController.text) {
      setState(() => _error = 'PINs do not match');
      return;
    }
    await ref.read(deviceLockServiceProvider).setPin(_pinController.text);
    setState(() {
      _error = null;
      _hasPin = true;
    });
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('PIN saved')));
  }

  Future<void> _removePin() async {
    await ref.read(deviceLockServiceProvider).clearPin();
    setState(() => _hasPin = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('PIN & Biometrics')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (_biometricSupported)
              SwitchListTile(
                title: const Text('Face ID / Fingerprint'),
                value: _biometricEnabled,
                onChanged: (v) async {
                  await ref.read(deviceLockServiceProvider).setBiometricEnabled(v);
                  setState(() => _biometricEnabled = v);
                },
              ),
            const Divider(),
            Text(_hasPin ? 'Change PIN' : 'Set a PIN', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 12),
            TextField(
              controller: _pinController,
              obscureText: true,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'New PIN'),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _confirmController,
              obscureText: true,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Confirm PIN'),
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!, style: const TextStyle(color: Colors.redAccent)),
            ],
            const SizedBox(height: 16),
            ElevatedButton(onPressed: _savePin, child: const Text('Save PIN')),
            if (_hasPin) ...[
              const SizedBox(height: 8),
              OutlinedButton(onPressed: _removePin, child: const Text('Remove PIN')),
            ],
          ],
        ),
      ),
    );
  }
}
